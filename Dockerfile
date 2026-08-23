# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- base ---
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# ------------------------------------------------------- dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --maxsockets 4

# -------------------------------------------------------------- build ---
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build \
    # Drop dev dependencies; the runtime only runs compiled JavaScript.
    && npm prune --omit=dev

# ------------------------------------------------------------ runtime ---
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/cloudbridge.db \
    WEB_DIST=/app/apps/web/dist

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Owned by `node` so a fresh named volume inherits the right permissions.
RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
