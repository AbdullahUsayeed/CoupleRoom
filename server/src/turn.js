'use strict';

const https = require('https');
const config = require('./config');

let cache = { at: 0, body: null };

// Accepts either a JSON array of RTCIceServer objects, or a comma/newline
// separated list of `url|username|credential` entries.
function parseStaticIce(raw) {
  if (!raw) return [];
  const trimmed = String(raw).trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    /* not JSON, fall through */
  }
  const servers = [];
  for (const entry of trimmed.split(/[\n,]+/)) {
    const parts = entry.split('|').map((s) => s.trim());
    if (!parts[0]) continue;
    if (parts[1]) servers.push({ urls: [parts[0]], username: parts[1], credential: parts[2] || '' });
    else servers.push({ urls: [parts[0]] });
  }
  return servers;
}

function baseIceServers() {
  const servers = [];
  if (config.stunUrls.length) servers.push({ urls: config.stunUrls });
  for (const server of parseStaticIce(config.staticIce)) servers.push(server);
  return servers;
}

function fetchCloudflareTurn() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ ttl: config.turnTtl });
    const req = https.request(
      {
        method: 'POST',
        hostname: 'rtc.live.cloudflare.com',
        path: '/v1/turn/keys/' + encodeURIComponent(config.cfTurnKeyId) + '/credentials/generate-ice-servers',
        headers: {
          Authorization: 'Bearer ' + config.cfTurnApiToken,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 8000
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => { buf += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(buf));
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error('cloudflare turn http ' + res.statusCode));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getIceServers() {
  if (config.turnMode === 'cloudflare' && config.cfTurnKeyId && config.cfTurnApiToken) {
    if (cache.body && Date.now() - cache.at < config.turnCacheMs) return cache.body;
    try {
      const body = await fetchCloudflareTurn();
      cache = { at: Date.now(), body };
      return body;
    } catch (e) {
      // Fall back to STUN / static so calls still have a chance to connect.
    }
  }
  return { iceServers: baseIceServers() };
}

module.exports = { getIceServers, parseStaticIce };
