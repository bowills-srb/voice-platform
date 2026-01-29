FROM node:20-alpine AS base

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/voice-engine/package.json ./apps/voice-engine/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/voice-engine ./apps/voice-engine

RUN cd packages/database && pnpm generate
RUN pnpm --filter @voice-platform/shared build
RUN pnpm --filter @voice-platform/voice-engine build

EXPOSE 4001

CMD ["node", "apps/voice-engine/dist/index.js"]
