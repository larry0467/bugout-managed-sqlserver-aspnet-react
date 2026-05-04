# --- build stage -----------------------------------------------------------
# Alpine (musl) base instead of slim (glibc). The Claude Agent SDK ships
# native binaries per platform and its runtime detection picks the
# `linux-x64-musl` variant on this Container App's hardware regardless of
# what the host libc actually is. Matching musl on the base image avoids
# the "Claude Code native binary not found" failure we hit on slim.
FROM node:20-alpine AS build

WORKDIR /app

# Install deps using lockfile when present.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Build TS.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime

# git + ca-certs are needed at runtime: simple-git shells out to git and the
# agent SDK fetches over HTTPS. openssh-client is needed for git over ssh
# in case future repos use that.
RUN apk add --no-cache git ca-certificates openssh-client

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=7100

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 7100

# Run as non-root for a small extra safety margin. Alpine's `adduser` differs
# from Debian's `useradd`. The repo path written at request time must be
# readable+writable by this UID — that's $TMPDIR/bugout-agent-repos which
# is auto-owned by the running process.
RUN adduser -D -s /bin/sh agent \
    && chown -R agent:agent /app
USER agent

# Bake the bot's git identity into the image so commits made by the agent
# have a valid author. Without this, `git commit` fails with
#   fatal: unable to auto-detect email address (got 'agent@<host>.(none)')
# These values appear in the PR commit metadata; the actual push auth is
# whatever PAT/App credential the sidecar resolved at runtime.
RUN git config --global user.name "Bug Out Managed Bot" \
    && git config --global user.email "noreply@managedplatform.com" \
    && git config --global init.defaultBranch main \
    && git config --global advice.detachedHead false

CMD ["node", "dist/server.js"]
