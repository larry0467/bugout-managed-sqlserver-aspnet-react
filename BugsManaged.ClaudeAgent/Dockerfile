# --- build stage -----------------------------------------------------------
FROM node:20-slim AS build

WORKDIR /app

# Install deps using lockfile when present.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Build TS.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage --------------------------------------------------------
FROM node:20-slim AS runtime

# git + ca-certs are needed at runtime: simple-git shells out to /usr/bin/git
# and the agent SDK fetches over HTTPS.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=7100

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 7100

# Run as non-root for a small extra safety margin. The repo path passed at
# request time must be readable+writable by this UID, so the host volume
# mount needs to be set up accordingly.
RUN useradd --create-home --shell /bin/bash agent \
    && chown -R agent:agent /app
USER agent

CMD ["node", "dist/server.js"]
