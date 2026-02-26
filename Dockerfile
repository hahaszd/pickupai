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

EXPOSE ${PORT:-3000}

CMD sh -c "node dist/server.js"
