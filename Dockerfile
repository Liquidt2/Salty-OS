# ═══════════════════════════════════════════
# Salty OS — Production Dockerfile
# Multi-stage build for minimal image size
# ═══════════════════════════════════════════

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve
FROM node:20-alpine AS production
WORKDIR /app

# Install a lightweight static server
RUN npm install -g serve@14

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy scripts for backup/update operations
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh 2>/dev/null || true

# Data volume mount point
VOLUME ["/app/data"]

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["serve", "-s", "dist", "-l", "3000"]
