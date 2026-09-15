'use strict';

const db = require('./db');

function persist(room, patch) {
  if (room) db.saveRoomState(room, patch);
}

// "Watch together" sync. Events mirror the client in web/src/Constants.js so
// the two stay easy to trace.
function register(namespace) {
  namespace.on('connection', (socket) => {
    socket.on('PLAY', () => {
      if (!socket.data.room) return;
      persist(socket.data.room, { playing: true });
      socket.to(socket.data.room).emit('PLAY');
    });

    socket.on('PAUSE', () => {
      if (!socket.data.room) return;
      persist(socket.data.room, { playing: false });
      socket.to(socket.data.room).emit('PAUSE');
    });

    socket.on('SYNC_TIME', (time) => {
      if (!socket.data.room) return;
      persist(socket.data.room, { currentTime: Number(time) || 0 });
      socket.to(socket.data.room).emit('SYNC_TIME', time);
    });

    socket.on('SEEK', (time) => {
      if (!socket.data.room) return;
      persist(socket.data.room, { currentTime: Number(time) || 0 });
      socket.to(socket.data.room).emit('SEEK', time);
    });

    socket.on('NEW_VIDEO', (videoId) => {
      if (!socket.data.room || !videoId) return;
      persist(socket.data.room, { videoId: String(videoId), currentTime: 0, playing: true });
      namespace.to(socket.data.room).emit('NEW_VIDEO', String(videoId));
    });

    socket.on('ASK_FOR_VIDEO_INFORMATION', () => {
      if (!socket.data.room) return;
      socket.to(socket.data.room).emit('ASK_FOR_VIDEO_INFORMATION');
    });

    socket.on('SYNC_VIDEO_INFORMATION', (data) => {
      if (!socket.data.room) return;
      namespace.to(socket.data.room).emit('SYNC_VIDEO_INFORMATION', data);
    });
  });
}

module.exports = { register };
