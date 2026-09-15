# ---- build the web client ---------------------------------------------------
FROM node:20-bookworm-slim AS web

WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# better-sqlite3 may need to compile on platforms without a prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Keep the same server/ + web/ layout as the repository so the server's
# default paths (../.. relative to server/src) resolve to /app.
COPY server/package.json server/package-lock.json* ./server/
RUN npm --prefix server install --omit=dev

COPY server/src ./server/src
COPY --from=web /web/dist ./web/dist

# Explicit paths keep the container working even if the layout ever changes.
ENV HOST=0.0.0.0
ENV PORT=5000
ENV STATIC_DIR=/app/web/dist
ENV DB_PATH=/app/data/couple-room.db
EXPOSE 5000

CMD ["node", "server/src/index.js"]
