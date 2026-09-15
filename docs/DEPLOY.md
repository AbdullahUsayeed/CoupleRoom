# Deploying CoupleRoom

CoupleRoom is a single Node process that serves the web client and both
Socket.IO namespaces. In production you put a TLS reverse proxy in front of it
so that browsers allow camera/microphone access and so your traffic is
encrypted.

```
Internet ──TLS──▶ reverse proxy (Caddy / nginx) ──▶ 127.0.0.1:5000 ──▶ CoupleRoom
```

## 1. Run the app

### Docker Compose

```bash
cp .env.example .env
# edit .env: set ROOM_PASSWORD, and TURN settings if you have them
docker compose up -d --build
```

The compose file binds to `127.0.0.1:5000` on purpose. Data lives in the named
volume `coupleroom-data`.

### systemd (no Docker)

```ini
# /etc/systemd/system/coupleroom.service
[Unit]
Description=CoupleRoom
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/CoupleRoom
EnvironmentFile=/opt/CoupleRoom/.env
ExecStart=/usr/bin/node server/src/index.js
Restart=on-failure
User=coupleroom

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now coupleroom
```

Build the web client first with `npm --prefix web install && npm --prefix web run build`.

## 2. Put HTTPS in front

### Caddy (simplest)

Caddy fetches and renews certificates automatically and upgrades websockets for
you. Use [`deploy/Caddyfile.example`](../deploy/Caddyfile.example):

```
room.example.com {
    reverse_proxy 127.0.0.1:5000
}
```

### nginx

Use [`deploy/nginx.conf.example`](../deploy/nginx.conf.example). The important
part is forwarding the `Upgrade`/`Connection` headers so Socket.IO can use
websockets, and raising the proxy timeouts because a call connection is
long-lived.

### Cloudflare Tunnel (no open ports)

If your server has no public inbound ports, run `cloudflared` and point the
tunnel at `http://127.0.0.1:5000`. Cloudflare terminates TLS for you.

## 3. Make calls reliable (TURN)

Calls work without a relay on the same network and across many home NATs. For
mobile networks and restrictive NATs, add TURN.

### Option A — self-hosted coturn

```bash
# on the server, with the optional compose profile
TURN_USER=couple TURN_PASSWORD=a-strong-secret TURN_REALM=room.example.com \
  docker compose --profile turn up -d
```

Open these ports in your firewall/security group:

- `3478/udp` and `3478/tcp` — the TURN listener
- `49160-49200/udp` — the relay port range

Then in `.env`:

```env
TURN_MODE=static
STATIC_ICE=turn:room.example.com:3478?transport=udp|couple|a-strong-secret
```

See [`deploy/turnserver.conf.example`](../deploy/turnserver.conf.example) for a
native coturn install, including the `external-ip` setting needed when the host
is behind NAT.

### Option B — Cloudflare Realtime TURN

Create a TURN key in the Cloudflare dashboard and set:

```env
TURN_MODE=cloudflare
CF_TURN_KEY_ID=your-key-id
CF_TURN_API_TOKEN=your-api-token
```

CoupleRoom generates short-lived credentials from those and caches them.

> Without TURN, calls still work in many cases thanks to STUN, but a relay is
> the difference between "usually works" and "always works".

## 4. Updating

```bash
git pull
docker compose up -d --build
```

Because chat history lives in SQLite, it survives rebuilds as long as the
`coupleroom-data` volume (or your `DB_PATH`) is preserved.

## Health check

`GET /api/health` returns `ok`. Point your uptime monitor or container health
check at it.
