# Container for the API (apps/api), for Google Cloud Run. The web app is not
# in this image; it goes on Vercel. Built from the repository root because the
# API depends on the @juma/shared workspace package. See DEPLOY.md.

FROM node:22-slim

# Prisma's query engine needs OpenSSL, which the slim image leaves out.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The version pinned in package.json's `packageManager`.
RUN npm install -g pnpm@12.11.2

WORKDIR /app
COPY . .

# Only the API and what it depends on; the web app's packages are not needed.
RUN pnpm install --frozen-lockfile --filter "@juma/api..." \
  && pnpm --filter @juma/shared build \
  && pnpm --filter @juma/api db:generate \
  && pnpm --filter @juma/api build

ENV NODE_ENV=production
WORKDIR /app/apps/api

# Cloud Run sets PORT (8080); the API reads it from the environment.
CMD ["node", "dist/src/index.js"]
