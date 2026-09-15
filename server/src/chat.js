'use strict';

const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const tokens = new Map();

function issueToken(name) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { name, expires: Date.now() + config.chatTokenTtlMs });
  return token;
}

function resolveToken(token) {
  if (!token || typeof token !== 'string') return null;
  const record = tokens.get(token);
  if (!record) return null;
  if (record.expires < Date.now()) {
    tokens.delete(token);
    return null;
  }
  return record;
}

// Sweep expired tokens periodically; unref so it never keeps the process alive.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [token, record] of tokens) if (record.expires < now) tokens.delete(token);
}, 60 * 1000);
if (sweeper.unref) sweeper.unref();

function unlocked(socket) {
  if (!config.roomPassword) return true;
  return !!socket.data.chatVerified;
}

function history(room) {
  return db.recentMessages(room, config.messageHistory);
}

function register(namespace) {
  namespace.on('connection', (socket) => {
    socket.on('CHAT_AUTH', (data, cb) => {
      const respond = (payload) => {
        if (typeof cb === 'function') cb(payload);
        socket.emit('CHAT_UNLOCKED', payload);
      };
      const room = socket.data.room;
      if (!room) return respond({ ok: false, error: 'join a room first' });

      if (config.roomPassword && (!data || String(data.password) !== config.roomPassword)) {
        socket.data.chatVerified = false;
        return respond({ ok: false, error: 'wrong password' });
      }

      socket.data.chatVerified = true;
      socket.join(room + ':chat');
      respond({
        ok: true,
        name: socket.data.username || 'someone',
        token: issueToken(socket.data.username || 'someone'),
        messages: history(room)
      });
    });

    socket.on('SEND_MESSAGE', (data) => {
      if (!socket.data.room || !unlocked(socket) || !data || !data.text) return;
      const text = String(data.text).slice(0, config.maxMessageChars).trim();
      if (!text) return;
      const username = (data.username || socket.data.username || 'Someone').toString().slice(0, 24);
      db.insertMessage(socket.data.room, username, text);
      namespace.to(socket.data.room + ':chat').emit('RECEIVED_MESSAGE', {
        username,
        text,
        createdAt: new Date().toISOString()
      });
    });

    socket.on('TYPING', (isTyping) => {
      if (!socket.data.room || !unlocked(socket)) return;
      socket.to(socket.data.room + ':chat').emit('TYPING', {
        username: socket.data.username,
        isTyping: !!isTyping
      });
    });

    socket.on('REACTION', (emoji) => {
      if (!socket.data.room || !unlocked(socket)) return;
      socket.to(socket.data.room + ':chat').emit('REACTION', {
        username: socket.data.username,
        emoji: String(emoji).slice(0, 8)
      });
    });
  });
}

module.exports = { register, unlocked, history, resolveToken };
