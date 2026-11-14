FROM node:22-bookworm-slim

# The online converter needs these native programs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript libreoffice-writer fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node backend/ ./

ENV NODE_ENV=production
ENV HOME=/home/node
ENV FILE_STORAGE_ROOT=/tmp/utilityhub
USER node
EXPOSE 10000
CMD ["node", "server.js"]
