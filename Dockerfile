# Aarsu / J.A.R.V.I.S. — production image
#
# Multi-stage: build the SPA and bundle the server, then ship a runtime layer with
# production dependencies only. The server bundle marks packages as external, so
# node_modules is required at runtime.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install with the lockfile so builds are reproducible.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Build output plus the config files the server reads from the working directory.
COPY --from=build /app/dist ./dist
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=build /app/metadata.json ./metadata.json

# Run unprivileged.
USER node

EXPOSE 3000

# Liveness: the container is up. /api/ready is the readiness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
