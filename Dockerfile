# syntax=docker/dockerfile:1.7
ARG VITE_SOCKET_URL

# Build the client assets and prepare the workspace
FROM node:20-bookworm AS builder
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
WORKDIR /app

# Install dependencies (uses npm workspaces)
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm ci

# Copy source code and build the client bundle
COPY . .
RUN npm run build

# Production image with only runtime dependencies
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache sqlite

# Copy static assets and shared modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/client/data ./client/data

# Install server production dependencies without bringing over builder node_modules
WORKDIR /app/server
COPY --from=builder /app/server/package*.json ./
RUN npm ci --omit=dev

# Copy server source after installing prod dependencies
COPY --from=builder /app/server ./
# Seed data assets (e.g., city templates) into a separate seed directory
COPY --from=builder /app/server/data ./data-seed

# Provide an entrypoint that seeds /app/server/data if the mounted volume is empty
COPY server/docker-entrypoint.sh /app/server/docker-entrypoint.sh
RUN chmod +x /app/server/docker-entrypoint.sh

EXPOSE 8021
CMD ["/app/server/docker-entrypoint.sh"]
