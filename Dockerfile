# ── Build stage ──────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/ ./packages/

RUN npm ci

RUN npm --workspace=tildagon-app run build
RUN npm --workspace=tildagon-app-directory-site run build

# ── Run stage ────────────────────────────────────────────────
FROM node:24-alpine

WORKDIR /app

ARG GIT_COMMIT_SHA=unknown
RUN echo -n "$GIT_COMMIT_SHA" > /app/commit.txt

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY package.json ./

ENV APP_STORE_MOCK=false
ENV PORT=3000
EXPOSE 3000

CMD ["./node_modules/.bin/tsx", "packages/tildagon-app-directory-api/index.ts"]
