'use strict';

// In-process smoke test. Boots the real server and exercises the HTTP and
// Socket.IO surface over an ephemeral port, then exits.
//
//   npm test
//
const os = require('os');
const path = require('path');

const port = 0; // let the OS pick a free port
process.env.HOST = '127.0.0.1';
process.env.PORT = String(port);
process.env.ROOM_NAME = 'test-room';
process.env.ROOM_PASSWORD = 'secret';
process.env.DB_PATH = path.join(os.tmpdir(), 'coupleroom-smoke-' + process.pid + '.db');

const { server, io: serverIo } = require('../src/index.js');
const db = require('../src/db.js');
const { io } = require('socket.io-client');

const results = [];
let failures = 0;

function check(cond, label) {
  results.push((cond ? 'PASS ' : 'FAIL ') + label);
  if (!cond) failures++;
}

function once(sock, event) {
  return new Promise((resolve) => sock.once(event, resolve));
}

function listening() {
  return new Promise((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });
}

function shutdown(code) {
  try {
    serverIo.close(() => {
      try { db.close(); } catch (e) { /* already closed */ }
    });
  } catch (e) {
    /* ignore */
  }
  process.exitCode = code;
}

(async () => {
  await listening();
  const base = 'http://127.0.0.1:' + server.address().port;

  const health = await fetch(base + '/api/health');
  check(health.status === 200 && (await health.text()) === 'ok', 'GET /api/health');

  const cfg = await (await fetch(base + '/api/config')).json();
  check(cfg.roomName === 'test-room' && cfg.chatPasswordRequired === true, 'GET /api/config');

  const ice = await (await fetch(base + '/api/turn-credentials')).json();
  check(Array.isArray(ice.iceServers) && ice.iceServers.length > 0, 'GET /api/turn-credentials');

  const a = io(base + '/movie', { path: '/socket.io', transports: ['websocket'] });
  const b = io(base + '/movie', { path: '/socket.io', transports: ['websocket'] });
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);
  check(true, 'movie namespace connects');

  const stateA = once(a, 'SYNC_STATE');
  a.emit('JOIN_ROOM', { room: 'test-room', username: 'Ana' });
  const stA = await stateA;
  check(stA.chatRequired === true && stA.chatVerified === false, 'chat locked before auth');
  check((stA.messages || []).length === 0, 'no history before auth');

  const stateB = once(b, 'SYNC_STATE');
  b.emit('JOIN_ROOM', { room: 'test-room', username: 'Bo' });
  await stateB;

  const wrong = await new Promise((resolve) => a.emit('CHAT_AUTH', { password: 'nope' }, resolve));
  check(wrong && wrong.ok === false, 'wrong password rejected');

  const unlocked = once(a, 'CHAT_UNLOCKED');
  a.emit('CHAT_AUTH', { password: 'secret' });
  const u = await unlocked;
  check(u && u.ok === true && typeof u.token === 'string', 'correct password unlocks');

  const unlockedB = once(b, 'CHAT_UNLOCKED');
  b.emit('CHAT_AUTH', { password: 'secret' });
  await unlockedB;

  const messageP = once(b, 'RECEIVED_MESSAGE');
  a.emit('SEND_MESSAGE', { username: 'Ana', text: 'hello world' });
  const message = await messageP;
  check(message && message.text === 'hello world', 'chat message delivered');

  const playP = once(b, 'PLAY');
  a.emit('PLAY');
  await playP;
  check(true, 'PLAY sync delivered');

  const videoP = once(b, 'NEW_VIDEO');
  a.emit('NEW_VIDEO', 'dQw4w9WgXcQ');
  check((await videoP) === 'dQw4w9WgXcQ', 'NEW_VIDEO sync delivered');

  const c1 = io(base + '/call', { path: '/socket.io', transports: ['websocket'] });
  const c2 = io(base + '/call', { path: '/socket.io', transports: ['websocket'] });
  await Promise.all([once(c1, 'connect'), once(c2, 'connect')]);
  const join1 = await new Promise((resolve) => c1.emit('call:join', { room: 'test-room' }, resolve));
  check(join1 && join1.peers.length === 0, 'call join (first peer)');

  const peerJoined = once(c1, 'call:peer-joined');
  const join2 = await new Promise((resolve) => c2.emit('call:join', { room: 'test-room' }, resolve));
  await peerJoined;
  check(join2 && join2.peers.length === 1, 'second peer sees the first');

  const signalP = once(c2, 'call:signal');
  c1.emit('call:signal', { kind: 'offer', payload: { sdp: 'x' }, to: join2.id });
  const signal = await signalP;
  check(signal && signal.kind === 'offer' && signal.from === join1.id, 'signal relayed to peer');

  const leftP = once(c1, 'call:peer-left');
  c2.disconnect();
  await leftP;
  check(true, 'peer-left broadcast');

  [a, b, c1, c2].forEach((s) => { try { s.disconnect(); } catch (e) { /* ignore */ } });

  console.log(results.join('\n'));
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  shutdown(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('smoke error:', err && err.stack);
  shutdown(2);
});
