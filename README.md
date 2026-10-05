# Formline Admin

Admin dashboard for the [Formline](https://formline.sopilnik.dev) poster store. Visitors get a private sandbox with
demo data; the owner's workspace receives the store's Stripe test orders. PostgreSQL row-level security keeps every
workspace apart.

## Development

Requirements: Node.js 26 or later, pnpm 11, Docker.

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
the version changes; copies of store orders and existing sandboxes are kept, the copies numbered after the generated
orders. Generated timestamps are relative to
`TEMPLATE_EPOCH` and shifted to the present when a sandbox is created.

## Housekeeping

A sandbox is deleted after 2 hours without activity, 24 hours after creation at the latest, or when its visitor signs out.
Expired sandboxes are removed after every demo entry (off the request path) and by the daily job, which runs at 03:17 UTC in
the server process: it also purges rate-limit windows and used challenges older than a day, expired sessions and failed
sign-in entries older than 90 days, retries the deletion of uploaded images from storage with a doubling delay (1 h to
24 h), and gives a store customer of the owner workspace their pseudonym 30 days after the panel first saw them. Nothing
else touches the database on a schedule.

## Product images

An upload goes to `POST /api/media?product=<id>` with the file as the request body: JPEG, PNG or WebP up to 2 MB and
40 megapixels, first frame only, turned upright by its EXIF orientation, re-encoded to WebP at most 2000 px on the longest
side with its metadata stripped, one image at a time in the whole process. It is stored as `ws/<workspace>/<image>.webp` in
the bunny Storage zone named by `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_HOST` and `BUNNY_STORAGE_KEY`, or in the folder
`MEDIA_STORAGE_DIR` in development and in the end-to-end tests, and `/media/<id>` serves it only to a signed-in member of
its workspace, never cached. A workspace holds at most 30 uploads or 20 MB; a session may upload 20 images an hour.
A replaced or removed upload, and the uploads of a deleted sandbox, are deleted from storage by the daily job.

## Store orders

Paid orders of the store's card checkout arrive at `POST /api/stripe/webhook`, the panel's own endpoint in the store's
Stripe sandbox. A delivery proves itself with Stripe's signature over the raw body (`STRIPE_WEBHOOK_SECRET`, five minutes'
tolerance, at most 64 KB), and only a paid `checkout.session.completed` goes on. Its line items are read with a restricted
test key (`STRIPE_RESTRICTED_KEY`, `rk_test_…`, reading Checkout Sessions only) and matched to the catalog by the names the
store gives its lines. One transaction keeps the order in the owner workspace — the customer, the lines, the first status,
the stock the lines take, "New order" and "Low stock" — and a copy in the template under a pseudonym that an HMAC of the
email picks (`PSEUDONYM_KEY`); sandboxes created afterwards show the latest 50 copies. A repeated delivery changes nothing.
If the panel was away for longer than Stripe retries — three days — Settings → Store → "Import missed orders" reads the
completed sessions of the last 30 days and keeps the missing ones through the same code: the owner only, after a fresh
sign-in, three times an hour. Without the three variables the webhook and the import answer 503. `STRIPE_API_BASE` points
the panel at a local stand-in for Stripe's API (`tests/e2e/stripe-stub.ts`) in development and in the end-to-end tests; in
production it is accepted only on a loopback address.

## Limits and measurements

At most 100 sandboxes are live at once; at the cap the least recently active one idle for more than 15 minutes is replaced,
and when none qualifies the demo button says so. One address may open five sandboxes an hour, resets included.
`tests/int/sandbox-size.test.ts` measures the table and index space of one sandbox (20 copies, `vacuum full` first) and
fails above 2 MB (a sandbox measures about 1.6 MB: the 700 orders with their lines and events take nine tenths of it); `tests/e2e/demo-timing.spec.ts` measures a warm "Enter the demo" and fails above 3 s. Both print a
JSON line with the number.

## Security model

The container is reachable only through the bunny edge. On the panel's own address the edge adds a shared secret and the
visitor's real IP as headers; the edge proxy checks both on every page and refuses anything without them, so the raw
origin and the pull zone's other hostnames stay closed. The edge also marks every answer but the built files and the
posters `Cache-Control: private, no-store`, which bunny would otherwise hand the browser as its own `no-cache`. Each
response carries a Content Security Policy built with a fresh per-request nonce, so only scripts
the server itself emitted can run. Inside the database, row-level security keeps every workspace's rows apart, and
the `app` role is checked at startup so the server can never fall back to a role that bypasses it.

## Owner recovery

When the owner has lost every second factor and the recovery codes, recovery needs access to the database:

    DATABASE_URL_MIGRATOR=… pnpm owner:recovery

The command prints a one-time code, valid for 30 minutes; only the schema owner may issue it, the application's own
role cannot. Open `/recover`, enter the code, a new password and the first code of a new authenticator app, and keep
the new recovery codes the page shows. Recovery removes every passkey and signs out every session of the owner, and it
lifts the password and second-factor lockouts.

## Deployment

The panel runs as one container on bunny Magic Containers behind bunny's edge (spec §4.1). The image (`Dockerfile`)
holds the standalone server and its start, `scripts/start.ts`, bundled with its dependencies by `pnpm build:start`. The
start runs the migrations with `DATABASE_URL_MIGRATOR`, checks the `app` role and then starts the server without the
migrator's address. When the database cannot be reached it serves every page but liveness as a 503 maintenance page
and keeps retrying every 30 seconds, then restarts the server normally; a refused login, a failed migration or a role
with too many rights stops the container instead. In the container (`FORMLINE_RUNTIME=container`) the media zone and the
three Stripe variables are required, and the local stand-ins are refused.

`GET /api/health` is liveness: it never touches the database, answers without the edge headers and names the image's
commit. `GET /api/health?db=1` is readiness — the database within five seconds and the role check — and like every other
request it must come through the edge.

A push to `main` runs `.github/workflows/deploy.yml`: the checks of `ci.yml`, the image to
`ghcr.io/sopilnik/formline-admin:<commit>` with provenance and an SBOM, `scripts/deploy-image.ts` (it points the
container at the new image by tag and digest through bunny's API and waits until liveness answers with the new commit),
the budget guard switched on again, and `scripts/smoke.ts` through the edge (liveness, readiness, the headers, nothing
private cached, the pull zone's own hostnames refused, and in a demo sandbox an image uploaded and read back, so sharp and
the storage zone are proven in the container on every deploy; a demo step that fails logs its name, the page's address and
its accessibility snapshot). The workflows read the bunny account key
from the `production` environment's secret `BUNNY_API_KEY` and three repository variables: `MC_APP_ID`,
`MC_CONTAINER_NAME` and `SITE_URL`.

`.github/workflows/probe.yml` runs one probe of spec §15 at a time by hand (`scripts/probe.ts`): `p1` the usage figures
and how old bunny's newest statistics are, `p2` that the edge overwrites a forged origin secret and client address and the
pull zone's own hostnames refuse a request with or without them, `p3` the endpoint and its pull zone, `p4` the edge cache,
`p5` readiness through the edge, `p6` "Enter the demo" timed twice. Each prints field names, figures, timings and statuses,
never a key or a raw hostname.

## Budget guard

`.github/workflows/budget-guard.yml` runs `scripts/guard.ts` every hour at minute 17 with the bunny account key of the
`production` environment. It reads what the panel's application has cost this month — `monthlyCost` of
`GET /mc/apps/{id}/summary` and the account's Magic Containers charges from `GET /billing`, the larger of the two — stops
the application with `POST /mc/apps/{id}/undeploy` at $4, and fails, so GitHub emails the owner, whenever it stopped the
application, could not read a figure, found the balance under $3 or got no answer from the panel's liveness check. An
application that is already stopped is left alone and the run passes. To bring the panel back, find the cause first, then
deploy the application again in the bunny dashboard (Magic Containers → the application → Deploy); the next run checks it
again. Every deploy switches the guard back on, because GitHub disables a scheduled workflow after 60 days without
activity in a public repository.
