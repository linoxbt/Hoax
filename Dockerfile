# The Hoax watcher (Railway). The web app deploys to Vercel from apps/web.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY services ./services
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev --ignore-scripts --workspaces --include-workspace-root \
  && npm install --no-save tsx@4.19.2
ENV NODE_ENV=production
# Mount a volume here: it holds the encrypted per-account Hoax keys.
ENV KEYSTORE_DIR=/data/keystore
EXPOSE 8080
CMD ["npx", "tsx", "services/watcher/src/main.ts"]
