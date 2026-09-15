'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS room_state (
  room TEXT PRIMARY KEY,
  video_id TEXT,
  current_time REAL DEFAULT 0,
  playing INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (room, id);
`);

const insertMessageStmt = db.prepare('INSERT INTO messages (room, username, text) VALUES (?, ?, ?)');
const recentMessagesStmt = db.prepare(
  'SELECT username, text, created_at FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?'
);
const getStateStmt = db.prepare('SELECT video_id, current_time, playing FROM room_state WHERE room = ?');
const upsertStateStmt = db.prepare(`
  INSERT INTO room_state (room, video_id, current_time, playing, updated_at)
  VALUES (@room, @video_id, @current_time, @playing, datetime('now'))
  ON CONFLICT(room) DO UPDATE SET
    video_id = COALESCE(excluded.video_id, room_state.video_id),
    current_time = excluded.current_time,
    playing = excluded.playing,
    updated_at = datetime('now')
`);

module.exports = {
  insertMessage(room, username, text) {
    insertMessageStmt.run(room, username, text);
  },
  recentMessages(room, limit) {
    return recentMessagesStmt.all(room, limit || config.messageHistory).reverse();
  },
  getRoomState(room) {
    return getStateStmt.get(room) || { video_id: null, current_time: 0, playing: 0 };
  },
  saveRoomState(room, patch) {
    const current = getStateStmt.get(room) || { video_id: null, current_time: 0, playing: 0 };
    upsertStateStmt.run({
      room,
      video_id: patch.videoId !== undefined ? patch.videoId : current.video_id,
      current_time: patch.currentTime !== undefined ? patch.currentTime : current.current_time,
      playing: patch.playing !== undefined ? (patch.playing ? 1 : 0) : current.playing
    });
  },
  close() {
    db.close();
  }
};
