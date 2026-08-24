FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

RUN npm install --global pnpm@11.23.0 \
  && npm cache clean --force

WORKDIR /workspace

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --chown=node:node next-env.d.ts next.config.ts postcss.config.mjs tsconfig.json ./
COPY --chown=node:node messages ./messages
COPY --chown=node:node public ./public
COPY --chown=node:node services ./services
COPY --chown=node:node src ./src
COPY --chown=node:node tools ./tools

RUN mkdir -p /workspace/.next \
  && chown node:node /workspace/.next

USER node
