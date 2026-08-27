# Bun build → Node run; Postgres-only runtime (no better-sqlite3 in final image).
ARG NODE_VERSION=24-alpine

FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock package-lock.json ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run build

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY package.json bun.lock package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts \
  && npm uninstall better-sqlite3 --legacy-peer-deps \
  && npm install tsx@^4.19.4 --no-save --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle/pg ./drizzle/pg
COPY src/db ./src/db
COPY tsconfig.json ./

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
