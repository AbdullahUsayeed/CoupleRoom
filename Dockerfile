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

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

COPY server/src ./src
COPY --from=web /web/dist ./web/dist

ENV HOST=0.0.0.0
ENV PORT=5000
EXPOSE 5000

CMD ["node", "src/index.js"]
