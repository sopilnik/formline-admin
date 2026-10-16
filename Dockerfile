# The panel's image: built with the repository's pnpm, run on Node 26 as the unprivileged node user. Its start,
# scripts/container.ts (which runs scripts/start.ts) bundled to dist/start.mjs and copied in as scripts/start.mjs, migrates
# the database, checks the role and then runs the standalone server.
# Both stages name the same Node image by digest, so Dependabot moves them together (tests/unit/versions.test.ts).
FROM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4 AS build
ARG PNPM_VERSION=11.28.5
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /src
RUN npm install --global "pnpm@${PNPM_VERSION}"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm build:start

FROM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4
WORKDIR /app
# Root owns the files; the node user reads them and writes only Next.js's cache.
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public
COPY --from=build /src/dist/start.mjs ./scripts/start.mjs
COPY --from=build /src/src/server/db/migrations ./src/server/db/migrations
# The server needs node alone. npm and npx come with the base image, outside the lockfile and its audit, so they go.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p .next/cache && chown node:node .next/cache
# The caps: bunny limits a container only by its host, so the process limits itself.
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
