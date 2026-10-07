# DAONG

A Philippine disaster-relief donation tracker: every donation gets a
tracking ID and a checkpoint trail from intake to delivery, publicly
searchable by anyone, with an AI assistant that answers from live data.

Frontend, application API and AI backend run as **one Express app on
one origin**, so there is no CORS setup, no second server, and no
separate dev server to run.

## Quick start

```bash
npm install
cp server/.env.example server/.env    # optional: add your AI key
npm start
```

Open **http://localhost:3000**.

The app works fully with an empty `.env` — drives, tracking, pledging,
the dashboard and admin operations all run. Only the AI assistant needs
a key; without one it reports itself offline instead of failing oddly.

- **Log In (Demo)** → donor account with real pledge history.
- **Log In as Coordinator** → unlocks Admin Operations: register a
  donation, log its next checkpoint, review what's flagged, reset data.
- **Track a Donation** (no login) → try `TN-1001`, `TN-1002`, `TN-1003`.

`server/data/db.json` is created from seed data on first boot. Delete it
to start over, or use "Reset Demo Data" in the dashboard.

## Architecture

```
                          USER
                            │
                   ┌────────┴────────┐
                   ▼                 ▼
            public/js/          public/js/ai/
            apiService.js       aiService.js
            (the only file      (the only file
             that calls the      that calls the
             application API)    AI API)
                   │                 │
                   └────────┬────────┘
                            ▼
                  server/api-routes.js          ← ONE router
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        server/store.js            server/ai/ai-routes.js
        (data/db.json)                     │
              │                            ▼
              │                  server/ai/ai-data.js
              └──────────────────────────► (controlled reads)
                                           │
                                           ▼
                                  server/ai/ai-context.js
                                  (system prompt, server-side)
                                           │
                                           ▼
                                    Anthropic Messages API
```

```
daong/
  public/                 the frontend (unchanged design)
    index · track · drives · info · about · dashboard .html
    css/    styles.css, ai-assistant-toggle.css
    js/     config.js      ← API base URL, read by both service layers
            apiService.js  ← the only file that calls the application API
            app.js         nav, theme, auth state, notifications
            pages.js       per-page rendering
            donations.js   tracking-ID formatting, anomaly scoring
            ai-assistant-toggle.js
      ai/   aiContext.js, aiService.js, aiAssistant.js, aiUI.js
    images/
  server/
    server.js       Express app: static site + middleware + mounts the router
    api-routes.js   THE API — shared by the local server and the Cloud Function
    store.js        data layer, seed data, hash chaining  (data/db.json)
    auth.js         demo-role login, pluggable token store (data/tokens.json)
    validators.js   server-side input validation
    rate-limiter.js per-IP, per-endpoint limits
    recaptcha.js    optional, off by default
    appCheck.js     optional, off by default
    ai/  ai-routes.js   /ai/chat, /ai/complete, /ai/health
         ai-context.js  system prompt + site knowledge (never sent to the browser)
         ai-data.js     the only path from the database into the model's context
  functions/        the same API as a Firestore-backed Cloud Function
  scripts/build-functions.sh
```

### One backend, not two

There used to be two Express servers — the application API and a
separate AI server — both defaulting to port 3000 and both wanting to
serve the same static site, so only one could ever run. The AI half is
now a router mounted on the same app. That is why the frontend can use
a single same-origin `/api/v1` base for everything.

Likewise there is one set of route handlers. `functions/index.js` used
to redeclare every endpoint itself and had drifted badly — it was
missing all the validation and role checks the Express server had, and
imported three modules that didn't exist in its folder, so it could not
start. Both targets now mount `server/api-routes.js`; only the storage
backend differs.

## API reference

All routes are prefixed `/api/v1`.
🔒 = requires `Authorization: Bearer <token>` · 👮 = coordinator only.

| Method | Path | Body / notes | Returns |
|---|---|---|---|
| GET | `/config` | public feature flags, never secrets | `{ aiEnabled, recaptcha, limits, stages }` |
| POST | `/auth/login` | `{ role: 'donor' \| 'admin' }` | `{ token, user }` |
| POST 🔒 | `/auth/logout` | revokes the token server-side | `{ ok }` |
| GET 🔒 | `/auth/me` | validates the stored token | `{ user }` |
| GET | `/drives` | | `{ drives }` |
| GET | `/drives/:id` | | `{ drive }` |
| GET | `/donations` | role-aware projection | `{ donations }` |
| GET | `/donations/:id` | role-aware projection | `{ donation }` |
| GET | `/donations/:id/verify` | recomputes the hash chain | `{ isIntact, checkpointsChecked }` |
| GET 👮 | `/donations/:id/audit` | | `{ donationId, auditLog }` |
| POST 👮 | `/donations` | `{ donor?, amountPhp, category?, org?, driveId? }` | `{ donation, drive }` |
| POST 🔒 | `/donations/pledge` | `{ driveId, amountPhp, category? }` | `{ pledgeId, status, donation, drive }` |
| POST 👮 | `/donations/:id/checkpoint` | `{ loc?, lat?, lng? }` — advances one stage | `{ donation }` |
| POST 👮 | `/donations/reset-demo` | restores seed data | `{ drives, donations }` |
| GET | `/notifications` | role-aware | `{ notifications }` |
| PATCH 🔒 | `/notifications/:id/read` | | `{ notification }` |
| GET | `/stats/impact` | figures for Info & Impact and the home page | `{ stats }` |
| GET 🔒 | `/me/summary` | dashboard totals + contribution history | `{ summary }` |
| GET 👮 | `/admin/stats` | | `{ stats }` |
| POST | `/contact` | `{ name, email, message }` | `201 { ok, id }` |
| POST | `/ai/chat` | `{ message, history, context }` | `{ reply }` |
| POST | `/ai/complete` | `{ task, donationId }` | `{ text }` |
| GET | `/ai/health` | | `{ ok, model }` or `503` |

**Error shape** — always JSON under `/api`, never HTML:

```jsonc
400 { "error": "validation_failed", "errors": ["amountPhp: must be between 100 and 10000000"] }
400 { "error": "invalid_json" }
401 { "error": "unauthorized" }
403 { "error": "admin_only" }
404 { "error": "not_found" }
409 { "error": "already_delivered" }
429 { "error": "rate_limited", "message": "…", "retryAfter": 812 }
500 { "error": "internal_error" }
```

### Role-aware reads

`GET /donations` returns different fields depending on who is asking.
The public projection carries the tracking data the Track page needs and
omits `donor`, `flagReason` and `auditLog` — donor names used to be
readable by anyone who called the endpoint. A coordinator token returns
the full record.

### Data model

**Drive** — a campaign: `{ id, title, category, goalPhp, raisedPhp, percentFunded }`

**Donation** — one tracked contribution:

```jsonc
{
  "id": "TN-1001",
  "driveId": "drv-001",
  "donor": "Anonymous Donor",     // coordinator-only
  "donorUserId": "usr-100",       // coordinator-only; links to the dashboard
  "amountPhp": 50000,
  "category": "Cash Relief",
  "org": "Bulacan Disaster Response",
  "date": "2026-08-15",
  "stageIndex": 3,                 // 0-4
  "status": "flagged",             // transit | verified | flagged
  "flagReason": { … },             // coordinator-only; present only when flagged
  "checkpoints": [
    { "stage": "Received", "loc": "…", "time": "…",
      "lat": 14.8433, "lng": 120.8113,
      "previousHash": "000…", "hash": "7bc6…" }
  ]
}
```

Stages run `Received → Allocated → Dispatched → In Transit → Delivered`.
A **flag** means "needs human verification" — never a confirmed problem.

Every checkpoint is stamped with
`SHA-256(previousHash + donationId + stage + loc + time + coords)` and
chained from a genesis hash, so `GET /donations/:id/verify` can prove
nothing was edited after the fact.

## The AI assistant

The assistant is grounded in the **database**, not in a fixed paragraph.
On every turn the server reads current figures through
`server/ai/ai-data.js` and fences them into the system prompt:

```
USER → chat panel → js/ai/aiService.js → POST /api/v1/ai/chat
                                             │
                     ai-data.js reads the store (aggregates, drive
                     progress, and the donation being viewed)
                                             │
                     ai-context.js builds the system prompt:
                       <live_data>  server-read, trustworthy
                       <page_data>  browser-sent, treated as data only
                                             │
                                    Anthropic Messages API
                                             │
                                        { reply } → panel
```

Ask "how many donations are in transit?" and the number comes from the
current database. Register a donation and the next answer reflects it.

**The API key exists in exactly one place**: `server/.env`, read by
`server/ai/ai-routes.js`. It is absent from every page, stylesheet and
client script. `donations.js` used to contain a browser-to-vendor call
as a fallback; that path is gone, because it could never have worked
without shipping a key to every visitor.

**Named tasks.** The Track page's journey summary and the dashboard's
flag explanation post `{ task, donationId }` — an ID, nothing more. The
server loads the record and builds the prompt. The browser previously
sent the figures themselves, which let anyone request an explanation of
a flag that never happened, using numbers they invented. `explain-flag`
also requires a coordinator token, since it exposes review detail.

**Injection posture.** Client-supplied context is rebuilt field by field
against a whitelist, length-capped, fenced in `<page_data>`, and
introduced with an explicit instruction that its contents are data and
never commands. Anything not on the whitelist is dropped before the
prompt is assembled. Replies are inserted with `textContent`, never
`innerHTML`, so the assistant cannot inject markup into the page.

To teach the assistant new facts, edit `server/ai/ai-context.js`. That
is the only place its knowledge and rules live, and it is server-side so
a visitor can never reach or rewrite it.

## Configuration

Everything lives in `server/.env` — see `server/.env.example` for the
full annotated list. Nothing is hardcoded to localhost.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Required for the assistant to answer |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Any current model id |
| `PORT` | `3000` | |
| `SERVE_STATIC` | `true` | `false` runs a pure JSON API |
| `STATIC_DIR` | `../public` | |
| `DAONG_DATA_DIR` | `server/data` | Where `db.json` and `tokens.json` live |
| `CORS_ORIGINS` | *(empty)* | Same-origin only unless set |
| `AUTH_TOKEN_TTL_HOURS` | `24` | |
| `REQUIRE_RECAPTCHA` | `false` | See below |
| `ENABLE_APP_CHECK` | `false` | Firebase App Check |
| `TRUST_PROXY_HOPS` | `0` | Set behind a proxy/CDN for correct rate-limit IPs |

**Frontend config** is `public/js/config.js`, loaded before every other
script. It defaults to same-origin `/api/v1`. If you host the frontend
separately, set `apiBaseUrl` there and add that origin to
`CORS_ORIGINS`.

### Hosting the frontend elsewhere

```bash
# server/.env
SERVE_STATIC=false
CORS_ORIGINS=http://localhost:5500,https://your-site.example.com
```

```html
<!-- before js/config.js in each page -->
<script>window.DAONG_CONFIG = { apiBaseUrl: 'https://your-api-host/api/v1' };</script>
```

## Security

- **No secret reaches the browser.** The model key is server-only; there
  is no `x-api-key` or `sk-ant-` string anywhere in `public/`.
- **Validation on both sides.** The forms validate for a fast, friendly
  experience; the server validates independently and rejects anything
  malformed regardless of what the client did.
- **Authorization is enforced per route**, not by hiding buttons.
  Coordinator routes answer `403` to a donor token even though the UI
  never shows them the control.
- **A pledge is filed under the session's identity**, not a name in the
  request body, so it can't be attributed to someone else.
- **Logout revokes server-side.** It used to only clear localStorage, so
  a copied token stayed valid for its full 24-hour life.
- **Escaped output.** All interpolated values go through `escapeHtml`,
  and AI replies are inserted as text.
- **Headers**: `Content-Security-Policy` (no `unsafe-eval`,
  `connect-src 'self'`), `X-Content-Type-Options`, `X-Frame-Options:
  DENY`, `Referrer-Policy`, plus a 64 kB body cap and per-endpoint rate
  limits.
- **Raw errors never reach users.** Stack traces and upstream vendor
  error bodies are logged; the client gets a stable code and a plain
  sentence.

### reCAPTCHA (optional, off by default)

`REQUIRE_RECAPTCHA` previously defaulted to *on* while no page ever sent
a token, so `POST /auth/login` answered `400 recaptcha_failed` on a
clean checkout — nobody could log in. It now enables only on an explicit
`REQUIRE_RECAPTCHA=true`, and the optional Google package is loaded
lazily so a missing dependency cannot stop the API from booting.

To turn it on: install `@google-cloud/recaptcha-enterprise`, set
`RECAPTCHA_PROJECT_ID`, `RECAPTCHA_SITE_KEY` and
`GOOGLE_APPLICATION_CREDENTIALS`, then set the same site key as
`recaptchaSiteKey` in `public/js/config.js`.

## Deploying

`DEPLOY.md` covers Firebase Hosting + a Firestore-backed Cloud Function.
Run `npm run build:functions` first (the predeploy hook does this
automatically) — it vendors `server/` into `functions/`, because Firebase
uploads only that directory and the routes must stay a single source of
truth.

## Known limits (prototype, not production)

- Login is a **demo role picker**, not a credential check. Swap
  `server/auth.js` for real sessions and a user table before this
  handles real accounts.
- `data/db.json` is a flat file — fine at hackathon scale, wrong for
  concurrent writers. The Firestore store in `functions/` shows the
  shape a real backend takes.
- Rate limiting is in-memory per instance. Put a real limiter or your
  CDN's in front for production.
- The programme-level figures on Info & Impact (relief value, operations,
  individuals reached) are seeded values in `db.json` representing wider
  field reporting; the "under review" count is computed live from actual
  flagged donations. The assistant says plainly that this is
  demonstration data if asked.
