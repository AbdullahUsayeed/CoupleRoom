# Contributing to CoupleRoom

Thanks for wanting to help. This is a small project — keep changes focused and
explain the "why" in your pull request.

## Getting set up

```bash
git clone https://github.com/AbdullahUsayeed/CoupleRoom.git
cd CoupleRoom
cp .env.example .env

npm --prefix server install
npm --prefix web install
npm --prefix web run build

npm --prefix server start   # http://localhost:5000
```

When working on the client, `npm --prefix web run build` regenerates
`web/dist`. Restart/reload the server to pick up a fresh build.

## Project conventions

- Plain JavaScript, CommonJS on the server and ES modules on the client.
- No comments unless they explain non-obvious intent.
- Keep the two Socket.IO namespaces (`/movie`, `/call`) and the event names in
  `server/src/*.js` and `web/src/Constants.js` in sync.
- Configuration always comes from environment variables via
  `server/src/config.js`; never hardcode secrets, domains or IP addresses.

## Testing your change

There is no test suite yet. At minimum, verify:

1. `node --check` passes for every file under `server/src`.
2. `npm --prefix web run build` succeeds.
3. The server boots and `GET /api/health` returns `ok`.
4. Open two browser tabs (or two devices) and confirm chat, watch-together sync
   and a call still work, with and without `ROOM_PASSWORD` set.

## Pull requests

- One logical change per PR, with a short description of the behaviour change.
- Update `README.md` / `docs/` when you add or change configuration.
- Don't commit `.env`, databases, or build output.

## License

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
