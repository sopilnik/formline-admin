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

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`.
