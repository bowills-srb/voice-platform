FROM node:20-alpine AS base

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

COPY packages/shared/package.json ./packages/shared/
COPY apps/dashboard/package.json ./apps/dashboard/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/dashboard ./apps/dashboard

RUN pnpm --filter @voice-platform/shared build
RUN pnpm --filter @voice-platform/dashboard build

EXPOSE 3000

CMD ["pnpm", "--filter", "@voice-platform/dashboard", "start"]
