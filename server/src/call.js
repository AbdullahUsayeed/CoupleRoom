'use strict';

const config = require('./config');

// WebRTC signaling for the 1:1 video call. The server never sees media, only
// SDP offers/answers and ICE candidates, plus a "peer joined/left" presence
// feed so the client knows when the other person is around.
function register(namespace) {
  const rooms = new Map();

  namespace.on('connection', (socket) => {
    socket.on('call:join', (data, cb) => {
      const room = (data && data.room) || config.roomName;
      const previous = socket.data.callRoom;

      if (previous && previous !== room && rooms.has(previous)) {
        rooms.get(previous).delete(socket.id);
        socket.leave(previous);
      }

      socket.join(room);
      socket.data.callRoom = room;

      const set = rooms.get(room) || new Set();
      const existing = [...set];
      set.add(socket.id);
      rooms.set(room, set);

      socket.to(room).emit('call:peer-joined', { id: socket.id });
      if (typeof cb === 'function') cb({ ok: true, id: socket.id, peers: existing });
    });

    socket.on('call:signal', (data) => {
      const room = socket.data.callRoom;
      if (!room || !data || !data.kind) return;
      const message = { from: socket.id, kind: data.kind, payload: data.payload };
      if (data.to) namespace.to(data.to).emit('call:signal', message);
      else socket.to(room).emit('call:signal', message);
    });

    socket.on('call:hangup', () => {
      const room = socket.data.callRoom;
      if (room) socket.to(room).emit('call:peer-left', { id: socket.id });
    });

    socket.on('disconnect', () => {
      const room = socket.data.callRoom;
      if (!room || !rooms.has(room)) return;
      const set = rooms.get(room);
      set.delete(socket.id);
      if (!set.size) rooms.delete(room);
      socket.to(room).emit('call:peer-left', { id: socket.id });
    });
  });
}

module.exports = { register };
