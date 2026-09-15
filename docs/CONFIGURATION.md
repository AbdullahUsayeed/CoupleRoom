# Configuration

CoupleRoom reads configuration from a `.env` file at the repository root (or
next to `server/`). Copy the template to get started:

```bash
cp .env.example .env
```

Environment variables that are already set in the shell take precedence over
the file.

## Server

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interface to bind. Use `0.0.0.0` for Docker/containers. |
| `PORT` | `5000` | Port to listen on. |
| `STATIC_DIR` | `web/dist` | Directory holding the built web client. |
| `DB_PATH` | `data/couple-room.db` | SQLite database file (chat + room state). |

## Room

| Variable | Default | Description |
| --- | --- | --- |
| `ROOM_NAME` | `couple-room` | Room identifier both clients join. |
| `ROOM_PASSWORD` | *(empty)* | Shared chat password. Empty leaves chat open to anyone who can reach the server. The video call and watch-together features are always available; only chat is gated. |
| `CHAT_TOKEN_TTL_MS` | `43200000` (12h) | How long an unlock token stays valid (in memory). |
| `MAX_MESSAGE_CHARS` | `4000` | Maximum length of a single chat message. |
| `MESSAGE_HISTORY` | `120` | How many past messages are replayed on join. |

## ICE / TURN

ICE configuration is what lets two browsers find a media path to each other.

| Variable | Default | Description |
| --- | --- | --- |
| `TURN_MODE` | `none` | `none` (STUN only), `static` (use `STATIC_ICE`), or `cloudflare`. |
| `STUN_URLS` | Google + Cloudflare STUN | Comma-separated STUN URLs, used in all modes. |
| `STATIC_ICE` | *(empty)* | TURN server(s) for `static` mode. |
| `CF_TURN_KEY_ID` | *(empty)* | Cloudflare Realtime TURN key id (only for `cloudflare`). |
| `CF_TURN_API_TOKEN` | *(empty)* | Cloudflare Realtime TURN API token (only for `cloudflare`). |
| `TURN_TTL` | `21600` | Lifetime (seconds) requested for Cloudflare credentials. |
| `TURN_CACHE_MS` | `10800000` (3h) | How long generated credentials are cached. |

### `STATIC_ICE` formats

Either a comma/newline separated list of `url|username|credential` entries:

```env
STATIC_ICE=turn:turn.example.com:3478?transport=udp|couple|secret,turn:turn.example.com:3478?transport=tcp|couple|secret
```

…or a JSON array of `RTCIceServer` objects:

```env
STATIC_ICE=[{"urls":"turn:turn.example.com:3478?transport=udp","username":"couple","credential":"secret"}]
```

The server exposes the resolved list to clients at
`GET /api/turn-credentials`, and the browser fetches it before negotiating a
call.

## HTTP endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns `ok` when the server is up. |
| `GET` | `/api/config` | Public runtime config for the client (room name, whether chat needs a password). |
| `GET` | `/api/turn-credentials` | ICE servers for WebRTC. |

## Socket.IO events

Room namespace: `/movie`

| Direction | Event | Notes |
| --- | --- | --- |
| client → server | `JOIN_ROOM` `{room, username}` | Enter the room; server replies with `SYNC_STATE`. |
| server → client | `SYNC_STATE` `{videoId, currentTime, playing, messages, users, chatRequired, chatVerified}` | Snapshot on join. |
| client → server | `CHAT_AUTH` `{password}` | Unlock chat; server replies with `CHAT_UNLOCKED`. |
| client → server | `SEND_MESSAGE` `{username, text}` | Requires an unlocked chat. |
| server → client | `RECEIVED_MESSAGE` `{username, text, createdAt}` | New message. |
| client ↔ server | `TYPING`, `REACTION`, `USERS` | Presence and lightweight feedback. |
| client ↔ server | `PLAY`, `PAUSE`, `SYNC_TIME`, `SEEK`, `NEW_VIDEO` | Watch-together sync. |

Call namespace: `/call`

| Direction | Event | Notes |
| --- | --- | --- |
| client → server | `call:join` `{room}` | Returns `{id, peers}`. |
| client ↔ server | `call:signal` `{kind, payload, to}` | SDP/ICE exchange (`invite`, `accept`, `offer`, `answer`, `ice`, `hangup`). |
| server → client | `call:peer-joined`, `call:peer-left` | Call presence. |
