# Formline Admin

Admin dashboard for the [Formline](https://formline.sopilnik.dev) poster store. Visitors get a private sandbox with
demo data; the owner's workspace receives the store's Stripe test orders. PostgreSQL row-level security keeps every
workspace apart.

## Development

Requirements: Node.js 24 or later, pnpm 11, Docker.

    pnpm install
    pnpm dev

Copy `.env.example` to `.env` before running anything that touches the database.

`pnpm db:up` starts Postgres 18 and PgBouncer in transaction mode on `127.0.0.1:55432` and `127.0.0.1:56432`.
`pnpm test:int` runs the integration tests against that stack; `pnpm db:down` stops it and removes its data.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` (builds first).

## Production-like run

    pnpm build && ORIGIN_AUTH_SECRET=… pnpm start

## Template data

Every sandbox is a copy of the template workspace: the store's catalog (`db/seed/catalog.ts`, with the poster images in
`public/posters/`), four demo users and 150 customers with 700 orders over 180 days, all generated deterministically by
`db/seed/generator.ts` from `TEMPLATE_VERSION`. `pnpm db:migrate` builds the template after the migrations and rebuilds it when
the version changes; copies of store orders and existing sandboxes are kept. Generated timestamps are relative to
`TEMPLATE_EPOCH` and shifted to the present when a sandbox is created.

## Housekeeping

A sandbox is deleted after 2 hours without activity, 24 hours after creation at the latest, or when its visitor signs out.
Expired sandboxes are removed after every demo entry (off the request path) and by the daily job, which runs at 03:17 UTC in
the server process: it also purges rate-limit windows and used challenges older than a day, expired sessions and failed
sign-in entries older than 90 days, and retries the deletion of uploaded images from storage with a doubling delay (1 h to
24 h). Nothing else touches the database on a schedule.

## Product images

An upload goes to `POST /api/media?product=<id>` with the file as the request body: JPEG, PNG or WebP up to 2 MB and
40 megapixels, first frame only, turned upright by its EXIF orientation, re-encoded to WebP at most 2000 px on the longest
side with its metadata stripped, one image at a time in the whole process. It is stored as `ws/<workspace>/<image>.webp` in
the bunny Storage zone named by `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_HOST` and `BUNNY_STORAGE_KEY`, or in the folder
`MEDIA_STORAGE_DIR` in development and in the end-to-end tests, and `/media/<id>` serves it only to a signed-in member of
its workspace, never cached. A workspace holds at most 30 uploads or 20 MB; a session may upload 20 images an hour.
A replaced or removed upload, and the uploads of a deleted sandbox, are deleted from storage by the daily job.

## Limits and measurements

At most 100 sandboxes are live at once; at the cap the least recently active one idle for more than 15 minutes is replaced,
and when none qualifies the demo button says so. One address may open five sandboxes an hour, resets included.
`tests/int/sandbox-size.test.ts` measures the table and index space of one sandbox (20 copies, `vacuum full` first) and
fails above 2 MB (a sandbox measures about 1.6 MB: the 700 orders with their lines and events take nine tenths of it); `tests/e2e/demo-timing.spec.ts` measures a warm "Enter the demo" and fails above 3 s. Both print a
JSON line with the number.

## Security model

The container is reachable only through the bunny edge, which adds a shared secret and the visitor's real IP as
headers to every request; the edge proxy checks both on every page and refuses anything without them, so the raw origin
stays closed. Each response carries a Content Security Policy built with a fresh per-request nonce, so only scripts
the server itself emitted can run. Inside the database, row-level security keeps every workspace's rows apart, and
the `app` role is checked at startup so the server can never fall back to a role that bypasses it.

## Owner recovery

When the owner has lost every second factor and the recovery codes, recovery needs access to the database:

    DATABASE_URL_MIGRATOR=… pnpm owner:recovery

The command prints a one-time code, valid for 30 minutes; only the schema owner may issue it, the application's own
role cannot. Open `/recover`, enter the code, a new password and the first code of a new authenticator app, and keep
the new recovery codes the page shows. Recovery removes every passkey and signs out every session of the owner, and it
lifts the password and second-factor lockouts.
