# Self-contained production image: backend + static frontend in one layer.
# Build context = repo root (unlike backend/Dockerfile, which is compose-only
# and relies on a volume mount for the frontend).
FROM node:20.18.1-alpine

# Backend runs from /app/backend; server.js serves ../frontend (=/app/frontend).
WORKDIR /app/backend

# Install prod deps first for layer caching.
COPY backend/package*.json ./
RUN npm ci --omit=dev

# App code + the static frontend the server serves.
COPY backend/ ./
COPY frontend/ ../frontend/

# Upload scratch dir; hand everything to the built-in non-root node user (uid 1000).
RUN mkdir -p /tmp/jobfinder_uploads \
 && chown -R node:node /app /tmp/jobfinder_uploads

USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:8000/api/health || exit 1

CMD ["node", "server.js"]
