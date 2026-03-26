FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY public ./public

ENV NODE_ENV=production
ENV SQLITE_PATH=/app/data/app.sqlite
ENV PORT=3000

# Persistent data lives in /app/data — mount a volume here to avoid data loss.
# e.g. docker run -v pickupai-data:/app/data ...
RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "dist/server.js"]
