# syntax=docker/dockerfile:1.7

# ---------- frontend build ----------
FROM node:20-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm install --workspace=frontend --no-audit --no-fund
COPY frontend/ frontend/
RUN npm run build --workspace=frontend

# ---------- backend build ----------
FROM node:20-bookworm-slim AS backend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm install --workspace=backend --no-audit --no-fund
COPY backend/ backend/
RUN npm run build --workspace=backend

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/data/dashboard.db \
    YAML_PATH=/app/services.yaml \
    PORT=3000

COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/backend/node_modules ./backend/node_modules
COPY --from=backend /app/backend/dist ./backend/dist
COPY --from=backend /app/backend/package.json ./backend/package.json
COPY --from=frontend /app/backend/public ./backend/public

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/index.js"]
