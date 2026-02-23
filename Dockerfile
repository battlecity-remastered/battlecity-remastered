# syntax=docker/dockerfile:1.7
ARG VITE_SERVER_URL

FROM node:20-bookworm AS builder
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/client-ts/package*.json apps/client-ts/
COPY apps/server-ts/package*.json apps/server-ts/
COPY packages/protocol/package*.json packages/protocol/
COPY packages/sim-core/package*.json packages/sim-core/
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8121

COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/client-ts/package*.json apps/client-ts/
COPY apps/server-ts/package*.json apps/server-ts/
COPY packages/protocol/package*.json packages/protocol/
COPY packages/sim-core/package*.json packages/sim-core/
RUN npm ci --omit=dev

COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages

EXPOSE 8121
CMD ["npm", "run", "start", "--workspace", "@battlecity/server-ts"]
