# CoupleRoom

[![CI](https://github.com/AbdullahUsayeed/CoupleRoom/actions/workflows/ci.yml/badge.svg)](https://github.com/AbdullahUsayeed/CoupleRoom/actions/workflows/ci.yml)

A tiny, self-hosted universe for two. One page with **video calling**, **chat**
and **watching YouTube together**, backed by a single small Node service you
can run on any VPS or even a Raspberry Pi.

CoupleRoom is the open-source, generalised version of a private app built for
two people. It keeps the parts that make a long-distance room feel alive and
drops everything personal.

## Features

- **Video call** — peer-to-peer WebRTC with a clean UI, mute/camera toggles and
  an automatic retry through your TURN relay when a direct connection fails.
- **Chat** — realtime messages with typing indicators and emoji reactions,
  stored in SQLite so history survives restarts. Optionally gated behind a
  shared room password.
- **Watch together** — paste a YouTube link and both players stay in sync
  (play, pause, seek and time drift correction).
- **Single service** — the Node server serves the web app and hosts both
  Socket.IO namespaces (`/movie` for the room, `/call` for signaling).
- **Bring your own TURN** — no relay, a self-hosted coturn, or Cloudflare
  Realtime TURN, chosen with one env var.

## How it works

```
                Browser (you)                     Browser (them)
   ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
   │  CoupleRoom web app (React)       │   │  CoupleRoom web app (React)       │
   │   • chat        ─┐                │   │   • chat        ─┐                │
   │   • watch-together├─ /movie ns ───┼───┼── /movie ns ─────┤                │
   │   • video call  ──┘  /call  ns ───┼───┼── /call  ns ─────┘                │
   └──────────────────────────────────┘   └──────────────────────────────────┘
                       │                                     │
                       └────────── WebRTC media ────────────┘
                                    (P2P or TURN)
```

The Node server only carries chat, room state and WebRTC **signaling** — media
never touches it. When a direct peer-to-peer path cannot be found, media is
relayed by the TURN server you configure.

### Layout

| Path | What it is |
| --- | --- |
| `server/` | Node 18+ backend (Express + Socket.IO 4 + better-sqlite3) |
| `server/src/chat.js` | Chat, typing, reactions, password gate |
| `server/src/sync.js` | Watch-together playback sync |
| `server/src/call.js` | WebRTC signaling for the video call |
| `server/src/turn.js` | ICE/TURN credential delivery |
| `web/` | React 16 front end bundled with esbuild |
| `deploy/` | Example nginx, Caddy and coturn configs |
| `docs/` | [Configuration](docs/CONFIGURATION.md) and [deployment](docs/DEPLOY.md) guides |

## Quickstart

### Docker (recommended)

```bash
git clone https://github.com/AbdullahUsayeed/CoupleRoom.git
cd CoupleRoom
cp .env.example .env      # edit ROOM_PASSWORD at least
docker compose up -d --build
```

Open <http://localhost:5000>. For camera/microphone access from another device
you must serve the app over HTTPS — see [docs/DEPLOY.md](docs/DEPLOY.md).

### Without Docker

Requires Node 18+ (20 recommended).

```bash
git clone https://github.com/AbdullahUsayeed/CoupleRoom.git
cd CoupleRoom
cp .env.example .env

npm install        # installs server + web dependencies
npm run build      # builds the web client
npm start          # starts the server
```

Then open <http://localhost:5000>.

The equivalent without the root shortcuts:

```bash
npm --prefix server install
npm --prefix web install
npm --prefix web run build
npm --prefix server start
```

## Configuration

All settings live in `.env`. The important ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ROOM_NAME` | `couple-room` | Room id both people join |
| `ROOM_PASSWORD` | *(empty)* | Shared password for chat; empty = open room |
| `PORT` / `HOST` | `5000` / `127.0.0.1` | Where the server listens |
| `TURN_MODE` | `none` | `none`, `static` or `cloudflare` |
| `STUN_URLS` | public STUN list | Used by every mode |
| `STATIC_ICE` | *(empty)* | TURN server(s) for `static` mode |
| `CF_TURN_KEY_ID` / `CF_TURN_API_TOKEN` | *(empty)* | Cloudflare Realtime TURN credentials |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for every option.

### Making calls reliable with TURN

Calls work out of the box on the same network and for many home NATs. For
reliability on mobile networks, run a relay:

```bash
# self-hosted coturn, bundled as an optional compose profile
TURN_USER=couple TURN_PASSWORD=change-me TURN_REALM=room.example.com \
  docker compose --profile turn up -d
```

Then in `.env`:

```env
TURN_MODE=static
STATIC_ICE=turn:room.example.com:3478?transport=udp|couple|change-me
```

Or let Cloudflare generate short-lived credentials:

```env
TURN_MODE=cloudflare
CF_TURN_KEY_ID=...
CF_TURN_API_TOKEN=...
```

## Security notes

- Chat is only password-gated; messages are stored **unencrypted** in SQLite on
  the server. Treat the server as trusted, or run it on hardware you own.
- Camera and microphone require HTTPS in every modern browser. Always deploy
  behind TLS (Caddy/nginx with certificates, or a tunnel).
- Never commit your `.env`. It is already git-ignored.
- Keep `HOST=127.0.0.1` when a reverse proxy sits in front of the app.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Please report security problems privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
