# DAONG

A Philippine disaster-relief donation tracker: every donation gets a
tracking ID and a checkpoint trail from intake to delivery, publicly
searchable by anyone.

This project pairs a purpose-built HTML/CSS/JS frontend (`public/`)
with an Express backend (`server/`) that implements exactly the API
contract the frontend expects — see `public/js/apiService.js` for that
contract; `server/server.js` implements it for real, on disk.

**`server/` also works standalone**, without `public/` at all — see
["Using the backend on its own"](#using-the-backend-on-its-own-a-different-frontend)
below if you're pointing a teammate's separately-built frontend at it
instead of using the one bundled here.

**Want this actually live on the internet, not just localhost?** See
[`DEPLOY.md`](DEPLOY.md) — deploys the frontend and a companion
Flutter client to Firebase Hosting, with the API running as a
Firestore-backed Cloud Function (`functions/`, a parallel deployable
version of `server/` — see that folder's own header comment for why
it's separate).

## Quick start (full app: this frontend + this backend)

```bash
npm install
npm start
```

Open **http://localhost:3000**. Frontend and API are served from the
same origin/port, so there's no CORS setup and no separate dev server
to run.

- **Log In (Demo)** → donor account with sample pledge history.
- **Log In as Coordinator (Admin Demo)** → unlocks the dashboard's
  "Admin Operations" panel: register a donation, log its next
  checkpoint, see what's currently flagged, reset demo data.
- **Track a Donation** (no login needed) → try `TN-1001`, `TN-1002`,
  `TN-1003`, or the ID printed after registering/pledging a new one.

## Architecture

```
daong/
  public/            the frontend
    index.html
    dashboard.html
    drives.html
    track.html
    about.html
    info.html
    css/
    js/
      apiService.js    ← the ONLY file that talks to the backend
      app.js            global nav/theme/auth-modal behavior
      pages.js          per-page render logic
      donations.js      tracking-ID formatting, anomaly scoring, AI calls
    images/
  server/            the backend
    server.js          Express app: serves public/ (if present) + /api/v1
    store.js           the data layer (seed data, persistence, hash chain)
    auth.js            demo-role login + Bearer token verification
    recaptcha.js        server-side reCAPTCHA v2 verification (pledge route)
    appCheck.js          Firebase App Check middleware (optional, guarded)
  data/
    db.json            auto-created on first run; the actual "database"
```

A native Flutter client for this same backend also exists as a sibling
project, `../daong_flutter` — see that project's own README.md.

### Why the frontend needed only a one-line change

`public/js/apiService.js` was already written against a specific API
contract (`GET /drives`, `POST /donations/:id/checkpoint`, etc.) and
already falls back to an in-memory mock when that API is unreachable —
clearly built to be pointed at a real backend later. The only edit
needed was:

```js
// before: const API_BASE_URL = 'https://api.daong.org.ph/api/v1';
const API_BASE_URL = '/api/v1';
```

Everything else — HTML, CSS, app.js, pages.js, donations.js — is
untouched. `server/server.js` returns exactly the JSON shapes the
frontend's own mock already produced, so switching from mock to real
data required no frontend changes beyond that URL.

### What the backend adds beyond the frontend's own mock

- **`server/store.js`** — real persistence. Drives and donations live in
  `data/db.json` and survive a server restart, unlike the frontend's
  in-browser mock (which resets on every page reload). Seeded with the
  identical demo data the mock shipped with, so the story ("TN-1001 is
  flagged," "Bulacan Flood Rapid Response is 72% funded") is consistent
  whether you're looking at mock or real data.
- **Hash-chained checkpoints** — every checkpoint appended to a donation
  is stamped with `SHA-256(previousHash + donationId + stage + loc + time)`,
  chained from a genesis hash. The frontend doesn't render these fields,
  but `GET /api/v1/donations/:id/verify` recomputes the whole chain and
  confirms nothing was silently edited — available for an admin tool or
  a future "Verify" button to call.
- **`server/auth.js`** — the frontend's login is explicitly a one-click
  "demo role" login (see `AuthStateManager.login()` in app.js), not a
  real credential check, so the backend mirrors that: `POST /auth/login`
  issues an opaque token for `donor` or `admin`, and write routes
  (`POST /donations`, `.../checkpoint`, `.../pledge`, `.../reset-demo`)
  require it via `Authorization: Bearer <token>`. Read routes (drives,
  donations, notifications) stay public, matching the Track page's
  "no login required" design.

## Firebase, reCAPTCHA, and Maps

Three more integrations layer onto the same backend/frontend, all
**optional and guarded** — none of them can break the demo if left
unconfigured, matching the pattern the earlier ReliefLedger Flutter
app used for the same integrations.

### reCAPTCHA v2 — the pledge form

The public pledge flow (`drives.html`'s "Pledge to this Drive") shows
a visible "I'm not a robot" checkbox before it'll submit, and the
backend independently re-verifies that token server-side
(`server/recaptcha.js`) before accepting the pledge — a client-side
checkbox alone can be bypassed by anyone calling the API directly, so
both sides check.

Ships with Google's published TEST site key (frontend) and TEST
secret key (backend) — that pair always verifies successfully, so
pledges work with zero setup. Before this goes anywhere real:
1. Register a site at https://www.google.com/recaptcha/admin (type: v2 checkbox).
2. Replace `RECAPTCHA_SITE_KEY` in `public/js/pages.js`.
3. Set the `RECAPTCHA_SECRET_KEY` environment variable to your secret key.

The admin's own "Register New Donation" form does **not** require this
— it's already behind coordinator login, so `requireAuth` alone gates it.

### Firebase App Check — API abuse protection

`server/appCheck.js` can require every `/api/v1` request to carry a
valid Firebase App Check token (reCAPTCHA v3 under the hood), on top
of whatever auth/reCAPTCHA a route already needs. It's a **no-op by
default** — `ENABLE_APP_CHECK` isn't set, so nothing changes until you
opt in:

1. `npm install firebase-admin`
2. Create a Firebase project → App Check → register a Web app with the
   reCAPTCHA v3 provider.
3. Download a service account key; set `GOOGLE_APPLICATION_CREDENTIALS`
   to its path (or `FIREBASE_SERVICE_ACCOUNT_JSON` to the key JSON as a string).
4. Set `ENABLE_APP_CHECK=true`.
5. Have your frontend attach the App Check token it gets from the
   Firebase JS SDK as an `X-Firebase-AppCheck` header on API calls.

If `ENABLE_APP_CHECK=true` but Firebase Admin can't initialize (missing
credentials, etc.), it logs a warning and **fails open** rather than
taking the API down.

### Maps — the tracking page (open source, no API key)

`track.html` plots a donation's geo-tagged checkpoints on a route map
(see `renderTrackMap` in `public/js/pages.js`) — the checkpoint data
model gained optional `lat`/`lng` fields (folded into the hash-chain,
so a pin can't be silently moved after the fact), and the three seed
donations are pre-tagged with real Philippine coordinates.

Uses [Leaflet](https://leafletjs.com/) (BSD-2, open source) rendering
[OpenStreetMap](https://www.openstreetmap.org/copyright) tiles — a
free, community-maintained map, loaded straight from a CDN in
`track.html`. **No API key, no billing account, no Google Cloud
project** — it renders the moment the page loads. This is the same
choice `daong_flutter` makes (via `flutter_map` + OSM) for the
identical reason: it stays demo-ready with zero setup.

Two things worth knowing before a real (non-hackathon) deployment:
- OSM's own tile server (`tile.openstreetmap.org`, used here) has a
  [usage policy](https://operations.osmfoundation.org/policies/tiles/)
  meant for light/demo traffic — attribution is already included (the
  small "OpenStreetMap contributors" credit in the map corner), which
  their policy requires. For real production traffic, switch to a paid
  tile provider built on the same OSM data (MapTiler, Stadia Maps,
  Mapbox, etc.) by changing the single `L.tileLayer(...)` URL in
  `renderTrackMap`.
- Nothing here does address geocoding (turning "Barangay Nangka" into
  coordinates) — checkpoints are seeded with coordinates directly.
  OSM's free [Nominatim](https://nominatim.org/) API can do that
  lookup if you want an admin tool to convert an address to lat/lng.

## Using the backend on its own (a different frontend)

`server/` has no dependency on `public/` — `server.js` checks whether
`public/` exists and only wires up static file serving if it does, so
you can delete `public/` entirely (or just never look at it) and run
`server/` as a pure JSON API for a teammate's separately-built frontend.

```bash
npm install
npm start
```

CORS is wide open (`cors()` with no options), so a frontend on any
other origin/port can call `http://localhost:3000/api/v1/...` directly
during development. Example:

```js
const res = await fetch('http://localhost:3000/api/v1/drives');
const { drives } = await res.json();
```

For the write routes, log in first and send the token back:

```js
const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'admin' }), // or 'donor'
});
const { token } = await loginRes.json();

await fetch('http://localhost:3000/api/v1/donations/pledge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ driveId: 'drv-001', amountPhp: 500, donor: 'Juan Dela Cruz' }),
});
```

### Data model

**Drive** — a fundraising campaign:
```json
{
  "id": "drv-001",
  "title": "Bulacan Flood Rapid Response",
  "category": "food",
  "goalPhp": 500000,
  "raisedPhp": 360000,
  "percentFunded": 72
}
```

**Donation** — one tracked contribution, linked to a Drive (or standalone):
```json
{
  "id": "TN-1001",
  "driveId": "drv-001",
  "donor": "Anonymous Donor",
  "amountPhp": 50000,
  "category": "Cash Relief",
  "org": "Bulacan Disaster Response",
  "date": "2026-08-15",
  "stageIndex": 3,
  "status": "flagged",
  "flagReason": {
    "hoursSinceLastCheckpoint": 31,
    "expectedWeight": 8.4,
    "currentWeight": 6.9,
    "routeDeviationKm": 3.8
  },
  "checkpoints": [
    {
      "stage": "Received",
      "loc": "Bulacan Central Warehouse",
      "time": "Aug 15, 08:02",
      "lat": 14.8433,
      "lng": 120.8113,
      "previousHash": "000...000",
      "hash": "2edfe8af..."
    }
  ]
}
```
`lat`/`lng` are optional (`null` when a checkpoint wasn't geo-tagged) —
present on the map on `track.html` when available.
`status` is one of `transit` / `verified` / `flagged`. `stageIndex` is
0–4, matching the 5 lifecycle stages: `Received`, `Allocated`,
`Dispatched`, `In Transit`, `Delivered`. `flagReason` is present only
when `status` is `flagged` — treat it as a "needs human verification"
signal, not a confirmed problem.

### API reference

All routes are prefixed `/api/v1`. 🔒 = requires `Authorization: Bearer <token>`. 🤖 = also requires a valid `recaptchaToken` (server-verified, see recaptcha.js).

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{ role: 'donor' \| 'admin' }` | `{ token, user }` |
| GET | `/drives` | — | `{ drives: Drive[] }` |
| GET | `/donations` | — | `{ donations: Donation[] }` |
| POST 🔒 | `/donations` | `{ donor, amountPhp, category, org, driveId? }` | `{ donation, drive \| null }` |
| POST 🔒🤖 | `/donations/pledge` | `{ driveId, amountPhp, donor, category?, org?, recaptchaToken, lat?, lng? }` | `{ pledgeId, status, donation, drive }` |
| POST 🔒 | `/donations/:id/checkpoint` | `{ loc?, lat?, lng? }` | `{ donation }` (advances one stage) |
| GET | `/donations/:id/verify` | — | `{ isIntact, checkpointsChecked }` |
| POST 🔒 | `/donations/reset-demo` | — | `{ drives, donations }` (restores seed data) |
| GET | `/notifications` | — | `{ notifications: [...] }` |

`user` shape: `{ id, name, email, role }`. Login is a **demo** login —
picking a role, not a real credential check (see `server/auth.js` if
you want to swap in real accounts later).

Error responses: `401 { error: 'unauthorized' }` for a missing/invalid
token on a 🔒 route; `404 { error: 'not_found' }` for an unknown
donation ID.

## Verified end-to-end (not just by reading the code)

Ran the actual app in a browser against this backend and confirmed:
- Home, Track, Drives, Dashboard, About, Info pages all render fully
  styled.
- `GET /api/v1/drives`, `/donations`, `/notifications` return live data
  from `data/db.json`.
- Logging in as Coordinator, registering a new donation, and clicking
  "Log Next Checkpoint" all persisted correctly and updated the UI in
  place — including flipping TN-1001 from `flagged` to `verified` once
  its final checkpoint was logged.
- Pledging to a Drive from the Drives page minted a new tracked
  donation ID and live-updated that drive's funding bar.
- `GET /api/v1/donations/:id/verify` correctly reports the hash chain
  intact for both seeded and newly-created donations.
- "Reset Demo Data" restores the original TN-1001/1002/1003 seed state.
- Standalone mode (no `public/`): confirmed `npm start` serves the API
  correctly on its own with no crash, `/` returns a JSON status
  response, and login/pledge/checkpoint/verify all work identically
  called cross-origin from outside the server.
- reCAPTCHA enforcement: confirmed via `curl` that `POST /donations/pledge`
  returns `400 { error: 'recaptcha_failed' }` with no token, and
  succeeds with Google's published test token (paired with the test
  secret key) — the actual server-side verification round-trip to
  Google, not just a stub.
- App Check: confirmed `ENABLE_APP_CHECK` unset (the default) lets
  every route through unchanged — the guard genuinely no-ops rather
  than silently failing closed.

### Gotcha worth knowing if you re-copy frontend files later

The HTML references assets as `css/styles.css`, `js/app.js`,
`images/hero-bg-960.jpg` etc. — they must live in those exact
subfolders under `public/`, not flattened into `public/` directly.

## Known limits (prototype, not production)

- `server/auth.js` tokens are in-memory — a server restart logs
  everyone out. Fine for a demo; swap for real sessions/JWT + a user
  table before this goes anywhere real.
- CORS is wide open by default — lock `origin` down in `server.js`
  (see the `TODO` comment near the top) before deploying publicly.
- `donations.js`'s AI features (`explainFlag`, `summarizeJourney`) call
  `https://api.anthropic.com/v1/messages` directly from the browser
  with no API key attached, so they'll currently show "Could not reach
  the AI explanation service." Proxy these through a backend route that
  holds the API key server-side before enabling them — never ship an
  Anthropic key to the browser.
- `data/db.json` is a flat-file store — fine at hackathon scale, but
  swap for a real database (Postgres, SQLite, etc.) before concurrent
  writers or larger data volumes are a concern.
