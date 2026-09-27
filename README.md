# Tracker

A private web app that shows where an iPhone is right now and replays its routes on a map.
It reads location points written once a minute (while armed) by an n8n anti-theft workflow into
MongoDB. Login required; nothing is readable without a session.

See the full design spec: [`docs/superpowers/specs/2026-09-27-tracker-design.md`](docs/superpowers/specs/2026-09-27-tracker-design.md).

## Architecture

```
Browser (React + MapLibre)
  └─ /api/*  (Vercel Functions, Web Request→Response; same handlers mounted by a Vite
    plugin locally)
        ├─ auth: POST /api/login, POST /api/logout, GET /api/session
        └─ data: GET /api/latest | /api/sessions | /api/points   (cookie required)
              └─ mongodb driver, dedicated find-only user "antitheft_webapp"
                    ├─ /api/sessions → view n8n.antitheft_routes
                    └─ /api/latest, /api/points → n8n.antitheft_locations
```

`api/*.ts` files export Web-standard `GET`/`POST` handlers (`Request` → `Response`). On Vercel
they run as Node.js Functions; locally, a Vite plugin (`vite.config.ts`) mounts the same handlers
so `npm run dev` behaves like production.

## Local dev

Two local data targets:

- `npm run dev` — a seeded local MongoDB in Docker. Config comes from `.env.local`.
- `npm run dev:atlas` — the real Atlas cluster. Vite's `loadEnv` layers the gitignored
  `.env.atlas.local` (containing only the real `MONGODB_URI`) over `.env.local` for this mode.

Setup:

```bash
npm install
bash scripts/local-mongo.sh      # starts a mongo:8 container on 127.0.0.1:27018
npm run seed:local               # creates collection/view/role/user, seeds synthetic routes
npm run dev                      # http://localhost:5173
```

`scripts/local-mongo.sh` generates a root Mongo password into `.env.local` on first run.
`scripts/seed-local.ts` (re)creates:
- the `antitheft_locations` collection (with validator + indexes) and the `antitheft_routes` view
- the custom role `antitheftReader` (`find` only, on both namespaces) and the `antitheft_webapp`
  database user
- ~300 synthetic points across 8 sessions for a demo device, in central Tel Aviv / Jaffa

It writes `MONGODB_URI`, `TRACKER_PASSWORD` and `SESSION_SECRET` into `.env.local` if not already
present.

If you are behind a TLS-intercepting proxy, point Node at your proxy's root CA for commands that
make outbound HTTPS calls (the seed script calls OSRM):
`NODE_EXTRA_CA_CERTS=/path/to/proxy-root-ca.pem npm run seed:local`.

## Production (Vercel)

1. Import the GitHub repo `pab1it0/tracker.cloudefined.com` into Vercel.
2. Set environment variables: `MONGODB_URI`, `MONGODB_DB`, `MONGODB_COLLECTION`,
   `MONGODB_ROUTES_VIEW`, `TRACKER_PASSWORD`, `SESSION_SECRET`.
3. Custom domain: add `tracker.cloudefined.com`, then in Cloudflare DNS create a `CNAME` to
   `cname.vercel-dns.com` with the proxy **off** (grey cloud) so Vercel can issue and manage TLS.

`vercel.json` sets `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`, a
15s max duration for `api/*.ts` functions, and response security headers (CSP, HSTS, frame/
referrer/content-type policy).

## MongoDB Atlas setup

1. The view `n8n.antitheft_routes` (one row per device + session). If it doesn't exist yet, create it
   with the same pipeline `scripts/seed-local.ts` uses locally; the app depends on its field names.
2. Create a custom role `antitheftReader`: `find` action only, granted on
   `n8n.antitheft_locations` and on the view `n8n.antitheft_routes`. `find` also covers read-only
   aggregate/count/distinct, which the app uses for `/api/latest`.
3. Create a database user `antitheft_webapp` with only that role, and restrict it to the
   cluster. Use a long, randomly generated password.
4. The connection string must include `authSource=admin`.
5. Recommended index: `{ device: 1, ts: -1 }` on `antitheft_locations`. Queries work without it,
   but it keeps `/api/latest` (per-device grouping) and `/api/points` fast as the collection
   grows. The app user is read-only, so this index has to be created separately in Atlas.

### Network access trade-off

Vercel Hobby functions have dynamic (non-static) egress IPs, so Atlas's network access list must
allow `0.0.0.0/0` in production. This is mitigated by the app connecting only as the
least-privilege, read-only `antitheft_webapp` user with a long random password — a leaked
connection string cannot write or read outside its two allowed namespaces. Vercel Static IPs
(Pro plan) would remove the need for `0.0.0.0/0` entirely.

## Security notes

- Session cookie: `HttpOnly`, `SameSite=Strict`, `Secure` (except on `http://localhost`),
  HMAC-signed (`SESSION_SECRET`), 7-day expiry.
- Password check is SHA-256 + constant-time compare; failed logins are rate-limited per IP
  (5 failures / 10 min) and return `429` with `Retry-After`.
- CSP restricts script/style/connect/img sources to self and the OpenFreeMap tile host; see
  `vercel.json` for the full header set.
- No secret ever reaches the browser bundle — server env vars are read only inside `api/*.ts`
  and `lib/server/**`.
- Every API response sets `Cache-Control: no-store`; errors are JSON `{error}` with no stack
  traces leaked to the client.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite + local API handlers against the seeded Docker Mongo |
| `npm run dev:atlas` | Same, but against the real Atlas cluster (`.env.atlas.local`) |
| `npm run build` | Typecheck, then build the production client bundle to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Typecheck both the app (`tsconfig.app.json`) and server (`tsconfig.server.json`) |
| `npm test` | Run the vitest suite |
| `npm run mongo:local` | Start/ensure the local `mongo:8` Docker container |
| `npm run seed:local` | (Re)create collection/view/role/user and seed synthetic demo data |
