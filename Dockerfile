# ═══════════════════════════════════════════
# Salty OS — Frontend (Nginx + React)
# Serves static files + proxies /api to backend
# ═══════════════════════════════════════════

# Stage 1: Build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Nginx to serve + proxy
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
