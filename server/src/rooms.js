'use strict';

const usersByRoom = {};

function roomUsers(room) {
  return Object.values(usersByRoom[room] || {});
}

function join(namespace, socket, room, username) {
  socket.data.room = room;
  socket.data.username = username;
  socket.join(room);
  usersByRoom[room] = usersByRoom[room] || {};
  usersByRoom[room][socket.id] = username;
  namespace.to(room).emit('USERS', roomUsers(room));
}

function leave(namespace, socket) {
  const room = socket.data.room;
  if (!room || !usersByRoom[room]) return;
  delete usersByRoom[room][socket.id];
  if (!Object.keys(usersByRoom[room]).length) delete usersByRoom[room];
  namespace.to(room).emit('USERS', roomUsers(room));
}

module.exports = { join, leave, roomUsers };
