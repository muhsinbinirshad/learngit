# Ledgerly API image. The service runs TypeScript directly on Node 22's native type stripping.
FROM node:22-alpine AS base
WORKDIR /app

# Install workspace links (no third-party dependencies, so this is fast and offline-friendly).
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "api/src/server.ts"]
