# Tracker — design

Date: 2026-09-27. Status: approved in chat (option 1, then revised to use a dedicated MongoDB user).

## Goal
A private web app at `tracker.cloudefined.com` (and `localhost` for dev) that shows where the iPhone
is now and replays its routes. Data comes from the owner's anti-theft n8n automations:
the **Location Ingest** workflow upserts one point per minute into MongoDB Atlas
`n8n.antitheft_locations` while the phone is armed.

## Constraints
- The data is full location history: login required, nothing readable without a session.
- No secret reaches the browser. The MongoDB URI and app secrets live only in server env.
- **The app queries MongoDB directly as the dedicated read-only user `antitheft_webapp`**
  (custom role `antitheftReader`: `find` on `n8n.antitheft_locations` and the view `n8n.antitheft_routes`).
  Not the n8n credential, not the phone's webhook token.
- Read-only for location data; arm/disarm moved into Tracker, see the addendum below.
- Runs locally (`npm run dev`) and on Vercel (Hobby) with the same code.

## Data
```js
{ point_id, device, session /* "yyyyMMddHH" | null */, ts: Date, received_at: Date,
  loc: { type: "Point", coordinates: [lon, lat] }, accuracy_m, altitude_m, speed_mps, battery }
```
A **session** (one hourly heartbeat loop) is the natural route. The session list comes from the view
`antitheft_routes` (one row per device + session: `start`, `end`, `points`, `last_battery`,
`route` LineString; pipeline documented in the README). Null-session points are
not listed as sessions but appear in "All points in range".

## Architecture
```
Browser (React + MapLibre)
  └─ /api/*  (Vercel Functions, Web Request→Response; same handlers mounted by a Vite plugin locally)
        ├─ auth: POST /api/login, POST /api/logout, GET /api/session
        └─ data: GET /api/latest | /api/sessions | /api/points   (cookie required)
              └─ mongodb driver (cached client, user antitheft_webapp)
                    ├─ /api/sessions → view n8n.antitheft_routes
                    └─ /api/latest, /api/points → n8n.antitheft_locations
```
- Mongo access needs only the `find` action (read-only). Sessions: `find` on the view with an overlap
  filter (`start < to`, `end >= from`), newest first, capped at 500. Distance, duration and bbox are
  derived from the view row in `lib/server`; per-point speed is derived client-side from points.
- The `mongodb` driver client is cached across warm invocations; `maxPoolSize` small; server
  selection timeout 8 s.

## API
| Route | Params | Returns |
|---|---|---|
| `POST /api/login` | `{password}` | 204 + cookie; 401 on mismatch (constant-time compare, 600 ms delay on failure) |
| `POST /api/logout` | | 204, cookie cleared |
| `GET /api/session` | | `{authenticated}` |
| `GET /api/latest` | | last point per device |
| `GET /api/sessions` | `from`, `to` (ISO, max span 93 d) | sessions with start/end/points/distance/battery range |
| `GET /api/points` | `from`, `to` (max span 31 d), optional `device` | points ascending, capped at 20,000 |

Every data route requires a valid session cookie. All params validated; errors are JSON
`{error}` with no stack traces. `Cache-Control: no-store` everywhere.

## Auth
- `TRACKER_PASSWORD` (env) checked with a SHA-256 + `timingSafeEqual` compare.
- Session cookie `tracker_session` = `v1.<expiresAt>.<hmac>`; HMAC-SHA256 with `SESSION_SECRET`.
  `HttpOnly; Secure (except localhost); SameSite=Strict; Path=/; Max-Age=7d`.
- Login rate-limited best-effort in memory per instance (5 failures / 10 min / IP).
- Security headers via `vercel.json` (CSP allowing only self + OpenFreeMap tiles, `frame-ancestors
  'none'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options`).

## UI
Full-bleed MapLibre map (OpenFreeMap `dark` / `positron` by theme) with a floating glass panel
(bottom sheet under 720 px).
- **Status**: device, "last seen N min ago", battery, accuracy circle around the latest fix, pulsing
  marker when fresh (< 5 min).
- **Range presets**: 24 h / 7 d / 30 d / custom dates.
- **Sessions list** grouped by day: time range, duration, distance, point count. Selecting fits the map.
  "All in range" shows every point in the window as one trail.
- **Route**: line with a single-hue sequential gradient (old → new), point dots, start/end markers,
  hover tooltip (time, speed, battery, accuracy).
- **Playback bar**: play/pause, speed (1×–600× time-lapse), scrubber whose track is a small speed
  area chart. A moving head marker follows. Keys: Space, ←/→, [ ].
- Table view of points (accessibility + exact values).
- Auto-refresh latest every 60 s.

## Env
`MONGODB_URI` (the `antitheft_webapp` SRV URI), `MONGODB_DB=n8n`, `MONGODB_COLLECTION=antitheft_locations`,
`MONGODB_ROUTES_VIEW=antitheft_routes`,
`TRACKER_PASSWORD`, `SESSION_SECRET` (≥ 32 bytes). `.env.local` for dev (git-ignored); Vercel env for prod.

## Atlas prerequisites (manual, UI)
1. View `antitheft_routes` — already exists in Atlas (confirmed 2026-09-27). Custom role
   `antitheftReader`: `find` on `n8n.antitheft_locations` and `n8n.antitheft_routes`.
2. Database user `antitheft_webapp` with only that role, restricted to Cluster0.
3. Network access: your IP for local dev. Vercel Hobby has no static egress, so production needs
   `0.0.0.0/0` on the access list. The mitigation is the least-privilege user + a strong generated
   password. Vercel Static IPs (Pro, $100/mo) remove that need.
4. Recommended index `{device:1, ts:1}` (`MONGODB-ATLAS-UI.md` §1) — queries work without it.

## Testing
- vitest: cookie sign/verify/expiry/tamper, password compare, param validation, haversine distance,
  speed derivation, session grouping, response shaping.
- Local integration against a disposable MongoDB (docker `mongo`) seeded with synthetic points,
  then live against Atlas once the user exists.
- Browser verification with Chrome DevTools at desktop and 390 px widths, light and dark.

## Out of scope
Photos (not stored), multi-user accounts.

## 2026-09-27 addendum: arm/disarm moved into Tracker
Arm/disarm moved out of the n8n form and into Tracker, backed by `n8n.antitheft_modes`
(`{ _id: device, device, mode, changed_at, last_checked_at }`; anything other than `'armed'`
reads as disarmed — fail closed).
- `POST /api/mode` — phone check-in, `X-AntiTheft-Token` header, no cookie. Creates the device
  disarmed on first check-in; arming an unknown device is a 404.
- `GET|POST /api/modes` — cookie-only, used by the Tracker UI to view/change mode.
- New role `antitheftModeWriter` (`find`/`insert`/`update` on `antitheft_modes`, no delete),
  granted to `antitheft_webapp` alongside `antitheftReader`.
