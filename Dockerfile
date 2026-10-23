# The Hoax watcher. The web app deploys to Netlify from apps/web.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY apps/web/package.json ./apps/web/package.json
# Only the watcher's dependency tree: the web app's wallet libraries stay out of the image.
RUN npm ci --ignore-scripts --no-audit --no-fund --workspace @hoax/watcher --include-workspace-root
ENV NODE_ENV=production
# Mount a volume here: it holds the encrypted per-account Hoax keys.
ENV KEYSTORE_DIR=/data/keystore
EXPOSE 8080
CMD ["npx", "tsx", "services/watcher/src/main.ts"]
