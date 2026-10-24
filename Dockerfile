# The Hoax watcher. The web app deploys to Netlify from apps/web.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY apps/web/package.json ./apps/web/package.json
# Only the watcher's dependency tree: the web app's wallet libraries stay out of the image.
RUN npm ci --ignore-scripts --no-audit --no-fund --workspace @hoax/watcher --include-workspace-root \
  && npm cache clean --force
COPY deploy/entrypoint.sh /usr/local/bin/hoax-entrypoint
RUN chmod 755 /usr/local/bin/hoax-entrypoint && mkdir -p /data/keystore && chown -R node:node /data
ENV NODE_ENV=production
# Mount a volume here: it holds the encrypted per-account Hoax keys.
ENV KEYSTORE_DIR=/data/keystore
EXPOSE 8080
# 503 while the engine is not doing its job (see main.ts /healthz).
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# The entrypoint starts as root only to hand /data to the node user, then runs the engine as node.
ENTRYPOINT ["hoax-entrypoint"]
CMD ["node", "--import", "tsx", "services/watcher/src/main.ts"]
