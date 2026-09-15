# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, contact
the maintainer privately via the email on their GitHub profile
(<https://github.com/AbdullahUsayeed>) or open a private security advisory on
the repository. You will get a response as soon as possible.

## What to know when self-hosting

CoupleRoom is designed to be run privately, between two people, on a server you
control. A few things worth understanding:

- **Chat is not end-to-end encrypted.** Messages are stored as plain text in a
  SQLite database on the server. `ROOM_PASSWORD` gates access to chat, but the
  server operator can read the data. Treat the server as trusted.
- **Always use HTTPS.** Camera and microphone APIs (and Socket.IO in general)
  should only be used over TLS. Use a reverse proxy with certificates, or a
  tunnel.
- **Keep `ROOM_PASSWORD` secret and non-trivial.** Anyone who can reach the
  server and knows the password can read and post messages.
- **TURN credentials are secrets.** Keep `CF_TURN_API_TOKEN` / coturn passwords
  out of git; `.env` is git-ignored by default.
- **Bind to `127.0.0.1`** when a reverse proxy runs in front of the app, so the
  Node port is not exposed directly.
- **Face data is not collected.** CoupleRoom does not implement biometric
  verification; only a shared room password is used.

## Supported versions

The latest commit on `main` is the supported version. There are no backports at
this time.
