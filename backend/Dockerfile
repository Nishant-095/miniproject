FROM node:22-bookworm-slim

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node backend/ ./

ENV NODE_ENV=production
ENV HOME=/home/node
USER node
EXPOSE 10000
CMD ["node", "server.js"]
