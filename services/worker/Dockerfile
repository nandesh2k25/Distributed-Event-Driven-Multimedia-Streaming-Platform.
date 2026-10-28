# Build context is the repository root:  docker build -f services/worker/Dockerfile .
FROM node:22-alpine

RUN apk add --no-cache ffmpeg && npm install -g pnpm@11.10.0

WORKDIR /app

# Install dependencies first so this layer is cached until a package.json changes
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY shared/package.json shared/
COPY services/worker/package.json services/worker/
RUN pnpm install --filter @music/worker... --no-frozen-lockfile

COPY shared shared
COPY services/worker services/worker
RUN pnpm --filter @music/shared build && pnpm --filter @music/worker build

ENV NODE_ENV=production
CMD ["node", "services/worker/dist/index.js"]
