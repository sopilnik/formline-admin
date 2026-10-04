# syntax=docker/dockerfile:1
# The panel's image (spec §13): built with the repository's pnpm, run on Node 26 as the unprivileged node user. Its start,
# scripts/start.ts bundled as scripts/start.mjs, migrates the database, checks the role and then runs the standalone server.
ARG NODE_IMAGE=node:26-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1

FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION=11.28.3
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /src
RUN npm install --global "pnpm@${PNPM_VERSION}"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm build:start

FROM ${NODE_IMAGE}
WORKDIR /app
# Root owns the files; the node user reads them and writes only Next.js's cache.
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public
COPY --from=build /src/dist/start.mjs ./scripts/start.mjs
COPY --from=build /src/src/server/db/migrations ./src/server/db/migrations
RUN mkdir -p .next/cache && chown node:node .next/cache
# The caps of spec §4.1: bunny limits a container only by its host, so the process limits itself.
ENV NODE_ENV=production \
    FORMLINE_RUNTIME=container \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UV_THREADPOOL_SIZE=2 \
    NODE_OPTIONS=--max-old-space-size=512
# The commit the image was built from; liveness reports it, so a deploy knows when the new container answers.
ARG FORMLINE_VERSION=dev
ENV FORMLINE_VERSION=${FORMLINE_VERSION}
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
