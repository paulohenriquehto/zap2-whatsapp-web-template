FROM node:22-bookworm-slim AS base

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.mjs ./
COPY src ./src
RUN npm run build

FROM base AS runner

ENV HOSTNAME=0.0.0.0

RUN mkdir -p /app/.auth/baileys /app/storage/media
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/src/app/icon.svg ./src/app/icon.svg
RUN chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
