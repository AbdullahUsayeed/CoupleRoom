# Publishing & Releases

This document explains how CoupleRoom is published as a **GitHub package** (a
container image on GitHub Container Registry, GHCR) and how to run it, cut a
release, and troubleshoot the pipeline. It is written for both users of the
published image and maintainers.

- [What gets published](#what-gets-published)
- [Run the published image](#run-the-published-image)
- [Cut a release (maintainers)](#cut-a-release-maintainers)
- [How the workflow works](#how-the-workflow-works)
- [Package visibility](#package-visibility)
- [Multi-architecture images](#multi-architecture-images)
- [Versioning policy](#versioning-policy)
- [Troubleshooting](#troubleshooting)
- [Publishing to npm instead (optional)](#publishing-to-npm-instead-optional)

## What gets published

| Package | Registry | Name | Example |
| --- | --- | --- | --- |
| Container image | GitHub Container Registry | `ghcr.io/<owner>/<repo>` | `ghcr.io/abdullahusayeed/coupleroom` |

The image contains everything: the Node server **and** the pre-built React web
client. There is no separate frontend package to serve.

Tags produced for a release tag like `v1.2.3`:

| Tag | Meaning |
| --- | --- |
| `1.2.3` | Exact version — recommended for production |
| `1.2` | Latest patch of the `1.2` line |
| `1` | Latest minor of the `1.x` line |
| `latest` | Most recent non-prerelease version |
| `sha-<short>` | The exact commit (useful for pinning/debugging) |

## Run the published image

### With Docker Compose (recommended)

```bash
git clone https://github.com/AbdullahUsayeed/CoupleRoom.git
cd CoupleRoom
cp .env.example .env      # then edit ROOM_PASSWORD etc.

docker compose -f docker-compose.release.yml up -d
```

Pin a version or use a fork's image with `COUPLEROOM_IMAGE`:

```bash
COUPLEROOM_IMAGE=ghcr.io/abdullahusayeed/coupleroom:1.0.0 \
  docker compose -f docker-compose.release.yml up -d
```

Add a TURN relay with the optional profile:

```bash
docker compose -f docker-compose.release.yml --profile turn up -d
```

### With plain Docker

```bash
docker run -d --name coupleroom --restart unless-stopped \
  -p 127.0.0.1:5000:5000 \
  --env-file .env \
  -e HOST=0.0.0.0 \
  -e DB_PATH=/app/data/couple-room.db \
  -v coupleroom-data:/app/data \
  ghcr.io/abdullahusayeed/coupleroom:1.0.0
```

Then put an HTTPS reverse proxy in front of port 5000 — see
[DEPLOY.md](DEPLOY.md). Browsers only allow camera/microphone access on secure
origins.

### Pull without Compose

```bash
docker pull ghcr.io/abdullahusayeed/coupleroom:1.0.0
```

If the package is still private, authenticate first (see
[Package visibility](#package-visibility)):

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-username> --password-stdin
```

## Cut a release (maintainers)

1. Make sure `main` is green in CI and you have committed everything you want
   in the release.

2. (Optional) Bump the version in `server/package.json`,
   `web/package.json`, `package.json`, and `package.json` `version` fields.

3. Create and push an annotated tag:

   ```bash
   git checkout main
   git pull
   git tag -a v1.0.0 -m "CoupleRoom v1.0.0"
   git push origin v1.0.0
   ```

4. The **Publish container image** workflow runs automatically. Watch it:

   ```bash
   gh run watch
   # or list runs
   gh run list --workflow docker-publish.yml
   ```

5. When it finishes, create the GitHub Release and attach notes:

   ```bash
   gh release create v1.0.0 \
     --title "CoupleRoom v1.0.0" \
     --notes "First public release: video call, chat and watch-together in one self-hosted room."
   ```

   The Release page links to the container image automatically.

6. Confirm the image is downloadable:

   ```bash
   docker manifest inspect ghcr.io/abdullahusayeed/coupleroom:1.0.0
   ```

You can also run the workflow without a tag from **Actions → Publish container
image → Run workflow**. A manual run produces `sha-<short>` (and, on the default
branch, `latest`) tags but no semver tags.

## How the workflow works

File: [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml)

- **Trigger** — pushing a `v*.*.*` tag, or manual dispatch.
- **Permissions** — `packages: write` lets the built-in `GITHUB_TOKEN` push to
  GHCR; no extra secret is required.
- **Lowercase name** — GHCR requires a lowercase path, so the workflow
  lowercases `github.repository` before use.
- **Buildx + QEMU** — enables building for multiple CPU architectures in one
  run.
- **`docker/metadata-action`** — derives tags and OCI labels from the git ref.
- **`docker/build-push-action`** — builds the root `Dockerfile` (which builds
  the web client and bundles it into the server image) and pushes it with
  GitHub Actions layer caching.
- **`push: true`** — the image is always pushed by this workflow; CI (the other
  workflow) never pushes.

## Package visibility

A newly published GHCR package is **private by default**, even for a public
repository. Anyone can pull it only after logging in with a token that has
`read:packages`. To make the image public:

**UI:** Repository → **Packages** → your package → **Package settings** →
**Change visibility** → **Public**.

**API:**

```bash
# requires a token with `write:packages` (or `delete:packages`) scope
gh api --method PATCH /user/packages/container/coupleroom \
  -f visibility=public
```

Making it public lets users `docker pull` without authenticating. If you keep
it private, document that users must `docker login ghcr.io` first.

## Multi-architecture images

The workflow builds `linux/amd64` and `linux/arm64`, so the same tag runs on
typical VPSs (amd64) and on ARM machines such as a Raspberry Pi 4/5 (arm64).
Docker selects the right architecture automatically on `docker pull`.

If you only need one architecture, edit the `platforms:` line in the workflow —
fewer platforms means faster builds and less CI time.

## Versioning policy

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes to configuration, the `.env` contract, or the
  Socket.IO event names.
- **MINOR** — new features, backwards compatible.
- **PATCH** — bug fixes, backwards compatible.

Pre-release tags such as `v1.1.0-rc.1` publish a `1.1.0-rc.1` image but do not
move `latest`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `denied: permission_denied` when pushing | Workflow missing `packages: write`, or a branch protection rule blocked it. Check the `permissions:` block. |
| `docker pull` → `unauthorized` | Package is private. Log in (`docker login ghcr.io`) or make it public (see above). |
| `docker pull` → `manifest unknown` | The tag does not exist yet (workflow still running), or you typo'd the image path (it is lowercase). |
| `invalid reference format` | Image path must be lowercase; use `ghcr.io/<owner-lowercase>/<repo-lowercase>`. |
| Workflow fails on the `arm64` leg | Remove `linux/arm64` from `platforms:` or ensure the native module has a prebuilt for that platform. |
| `npm ci` fails in the image build | `package-lock.json` out of sync. Run `npm install` in `server/` and `web/` locally and commit the lockfiles. |
| Old image served after `up -d` | Re-pull: `docker compose -f docker-compose.release.yml pull && ... up -d`. |

## Publishing to npm instead (optional)

CoupleRoom is an application, not a library, so the npm packages under
`server/` and `web/` are marked `"private": true` and are **not** published to
the npm registry or GitHub Packages. If you want to distribute them as
packages anyway:

1. Remove `"private": true` from the relevant `package.json`.
2. Add a publish job that runs `npm publish` with
   `registry-url: https://npm.pkg.github.com` in `actions/setup-node`, using
   `secrets.GITHUB_TOKEN` as `NODE_AUTH_TOKEN`.
3. Scope the package names to the owner, e.g. `@abdullahusayeed/coupleroom-server`.

For most users the container image is the intended and simplest distribution
channel.
