'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./config');
const db = require('./db');
const rooms = require('./rooms');
const chat = require('./chat');
const sync = require('./sync');
const call = require('./call');
const { getIceServers } = require('./turn');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io',
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6
});

app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (req, res) => {
  res.type('text/plain').send('ok');
});

// Public, non-secret runtime config for the web client.
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    roomName: config.roomName,
    chatPasswordRequired: !!config.roomPassword,
    turnMode: config.turnMode
  });
});

app.get('/api/turn-credentials', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json(await getIceServers());
  } catch (e) {
    res.status(503).json({ error: 'turn unavailable', detail: String((e && e.message) || e) });
  }
});

// Serve the built web app when present (single-origin deploy).
if (fs.existsSync(config.staticDir)) {
  app.use(express.static(config.staticDir));
  app.get(/^(?!\/api|\/socket\.io).*/, (req, res) => {
    res.sendFile(path.join(config.staticDir, 'index.html'));
  });
} else {
  console.warn('[coupleroom] no web build found at ' + config.staticDir + ' (run `npm --prefix web run build`)');
}

// ---- /movie: presence, watch-together sync and chat -------------------------
const movie = io.of('/movie');

movie.on('connection', (socket) => {
  socket.on('JOIN_ROOM', (data) => {
    const room = (data && data.room) || config.roomName;
    const username = ((data && data.username) || 'Someone').toString().slice(0, 24);

    rooms.join(movie, socket, room, username);
    socket.data.chatVerified = !config.roomPassword;
    if (socket.data.chatVerified) socket.join(room + ':chat');

    const state = db.getRoomState(room);
    socket.emit('SYNC_STATE', {
      videoId: state.video_id,
      currentTime: state.current_time,
      playing: !!state.playing,
      messages: socket.data.chatVerified ? chat.history(room) : [],
      users: rooms.roomUsers(room),
      chatRequired: !!config.roomPassword,
      chatVerified: socket.data.chatVerified
    });

    movie.to(room).emit('USERS', rooms.roomUsers(room));
  });

  socket.on('disconnect', () => rooms.leave(movie, socket));
});

chat.register(movie);
sync.register(movie);

// ---- /call: WebRTC signaling ------------------------------------------------
call.register(io.of('/call'));

server.listen(config.port, config.host, () => {
  console.log('[coupleroom] listening on ' + config.host + ':' + config.port);
  console.log('[coupleroom] room "' + config.roomName + '", chat ' + (config.roomPassword ? 'password-protected' : 'open'));
  console.log('[coupleroom] TURN mode: ' + config.turnMode);
});

module.exports = { app, server, io };
