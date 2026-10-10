# Production image: built frontend + Express API + media worker.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HOST=0.0.0.0 PORT=4317 DATA_DIR=/data MODEL_CACHE_DIR=/models
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# ffprobe-static ships every platform's binary; keep only linux/x64.
RUN npm ci --omit=dev \
    && find node_modules/ffprobe-static/bin -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} + \
    && find node_modules/ffprobe-static/bin/linux -mindepth 1 -maxdepth 1 ! -name x64 -exec rm -rf {} + \
    && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY assets ./assets
COPY docs ./docs
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
RUN node scripts/setup.mjs
VOLUME ["/data", "/models"]
EXPOSE 4317
CMD ["node", "server/index.mjs"]
