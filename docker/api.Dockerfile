FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy package.json files
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages ./packages
COPY apps/api ./apps/api

# Generate Prisma client
RUN cd packages/database && pnpm generate

# Build
RUN pnpm --filter @voice-platform/shared build
RUN pnpm --filter @voice-platform/api build

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
