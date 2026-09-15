'use strict';

const fs = require('fs');
const path = require('path');

// Minimal .env loader so the project has no runtime dotenv dependency.
// Looks for `.env` at the repo root first, then next to the server.
function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '.env')
  ];
  for (const file of candidates) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      continue;
    }
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadEnv();

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function list(value, fallback) {
  const raw = value === undefined ? fallback : value;
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const root = path.resolve(__dirname, '..', '..');

module.exports = {
  root,
  host: process.env.HOST || '127.0.0.1',
  port: num(process.env.PORT, 5000),

  // Room / chat
  roomName: process.env.ROOM_NAME || 'couple-room',
  roomPassword: process.env.ROOM_PASSWORD || '',
  chatTokenTtlMs: num(process.env.CHAT_TOKEN_TTL_MS, 12 * 60 * 60 * 1000),
  maxMessageChars: num(process.env.MAX_MESSAGE_CHARS, 4000),
  messageHistory: num(process.env.MESSAGE_HISTORY, 120),

  // Storage / static files
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'couple-room.db'),
  staticDir: process.env.STATIC_DIR || path.join(root, 'web', 'dist'),

  // ICE / TURN
  turnMode: (process.env.TURN_MODE || 'none').toLowerCase(),
  stunUrls: list(process.env.STUN_URLS, 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478'),
  staticIce: process.env.STATIC_ICE || '',
  cfTurnKeyId: process.env.CF_TURN_KEY_ID || '',
  cfTurnApiToken: process.env.CF_TURN_API_TOKEN || '',
  turnTtl: num(process.env.TURN_TTL, 21600),
  turnCacheMs: num(process.env.TURN_CACHE_MS, 3 * 60 * 60 * 1000)
};
