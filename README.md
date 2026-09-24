# Formline Admin

Admin dashboard for the [Formline](https://formline.sopilnik.dev) poster store. Visitors get a private sandbox with
demo data; the owner's workspace receives the store's Stripe test orders. PostgreSQL row-level security keeps every
workspace apart.

## Development

Requirements: Node.js 24 or later, pnpm 11, Docker.

    pnpm install
    pnpm dev

Copy `.env.example` to `.env` before running anything that touches the database.

`pnpm db:up` starts Postgres 17 and PgBouncer in transaction mode on `127.0.0.1:55432` and `127.0.0.1:56432`.
`pnpm test:int` runs the integration tests against that stack; `pnpm db:down` stops it and removes its data.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` (builds first).

## Production-like run

    pnpm build && ORIGIN_AUTH_SECRET=… pnpm start

## Security model

The container is reachable only through the bunny edge, which signs every request with a shared secret and the
visitor's real IP; the edge proxy checks both on every page and refuses anything without them, so the raw origin
stays closed. Each response carries a Content Security Policy built with a fresh per-request nonce, so only scripts
the server itself emitted can run. Inside the database, row-level security keeps every workspace's rows apart, and
the `app` role is checked at startup so the server can never fall back to a role that bypasses it.
