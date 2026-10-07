# Deploying DAONG to Firebase

This deploys **two Firebase Hosting sites** (the HTML frontend + the
Flutter web client) backed by **one Cloud Function** (the API) and
**Firestore** (the database) — all in one Firebase project.

Everything below is code and config I've already written and verified
locally via the Firebase Emulator Suite (no real project needed for
that part). What's left is steps only you can do — they need your own
Google account and, importantly, a **billing method on file** (see
step 3) — so this is a checklist to run yourself, not something I can
do from here.

## What's already done for you

- `functions/index.js` — mounts the **same** `server/api-routes.js` the
  local server uses, against `functions/store-firestore.js`. There is no
  second copy of the routes; the earlier version redeclared every
  endpoint, was missing all the validation and role checks, and imported
  three modules that didn't exist in that folder, so it could not start.
- `functions/store-firestore.js` — a real Firestore implementation.
  Cloud Functions instances have no durable writable disk, so the flat
  JSON file `server/` uses locally cannot work once deployed. (The
  previous code imported a `FirestoreStore` that was just an alias for
  the flat-file class, so a deployed function would have silently lost
  every write.) Auth tokens go to Firestore too, otherwise a token
  issued by one instance is rejected by every other one.
- `scripts/build-functions.sh` — vendors `server/` into
  `functions/server/` before deploy, because Firebase uploads only the
  `functions/` directory. Wired as a `predeploy` hook in
  `firebase.json`, so `firebase deploy` runs it for you. **Never edit
  `functions/server/` by hand — it is overwritten on every build.**
- `firebase.json`, `firestore.rules`, `firestore.indexes.json`,
  `.firebaserc` — config for both Hosting sites + the Function +
  Firestore, with `YOUR_FIREBASE_PROJECT_ID` placeholders (step 5).

**Verification status — read this honestly.** The Cloud Function path
was exercised against an in-memory Firestore double: seeding, login,
token verification across writes, donation creation, checkpoint
chaining, chain verification, validation, role gating and the AI routes
all pass there. It has **not** been run against real Firestore or the
Firebase emulator, because that needs your Google account. Expect to
run `firebase emulators:start` once (step 8a) before deploying for
real.

## Steps you run yourself

### 1. Install the Firebase CLI (if you haven't)

Already a local dev dependency here — from the `daong/` folder you can
just prefix commands with `npx`, e.g. `npx firebase login`. Or install
it globally: `npm install -g firebase-tools`.

### 2. Log in

```bash
npx firebase login
```

Opens a browser for your Google account. This is the one step that
fundamentally can't be automated — it's your identity, not something
I can supply.

### 3. Create a Firebase project

Either at [console.firebase.google.com](https://console.firebase.google.com)
("Add project"), or:

```bash
npx firebase projects:create your-project-id
```

**Important — billing**: Cloud Functions requires the **Blaze
(pay-as-you-go) plan**, even if you stay entirely within the free
tier (which a hackathon demo almost certainly will — 2M function
invocations/month free, generous Firestore free tier too). The
console will prompt you to attach a billing method when you try to
use Functions on a new project. This is a real step with real
payment-method implications, so I'm flagging it plainly rather than
glossing over it — nothing will charge you at hackathon-demo traffic
levels, but the card has to be on file for Google to allow it at all.

### 4. Point this project at your Firebase project

```bash
npx firebase use --add
```
Pick the project you just created, alias it `default`.

### 5. Create the second Hosting site (for the Flutter client)

Every Firebase project gets one default Hosting site automatically
(same name as your project ID) — that's the `web` target. You need to
create one more for `flutter`:

```bash
npx firebase hosting:sites:create your-project-id-flutter
```

### 6. Wire up the two Hosting targets

```bash
npx firebase target:apply hosting web your-project-id
npx firebase target:apply hosting flutter your-project-id-flutter
```

Then open `.firebaserc` and replace every `YOUR_FIREBASE_PROJECT_ID`
with your actual project ID (both `target:apply` commands above also
just rewrite this file, so you can skip manual editing if those
commands succeeded — check the file matches what you expect).

### 7. Build the Flutter client

```bash
cd ../daong_flutter
flutter build web --release
cd ../daong
```

### 8a. Try it on the emulator first (recommended)

```bash
npm run build:functions
npx firebase emulators:start --only functions,firestore,hosting
```

Open the Hosting emulator URL it prints. This is the first time the code
touches real Firestore APIs, so it's worth doing before a live deploy.

### 8. Deploy

```bash
npx firebase deploy
```

The `predeploy` hook runs `npm run build:functions` automatically.

This deploys the Function, both Hosting sites, and the Firestore
rules/indexes in one go. First deploy takes a few minutes (Cloud
Functions cold build).

### 9. Point the Flutter client at the real API

The deploy output prints your two Hosting URLs, e.g.:
```
Hosting URL (web): https://your-project-id.web.app
Hosting URL (flutter): https://your-project-id-flutter.web.app
```

Open `daong_flutter/lib/main.dart`, find `kDaongApiBaseUrl`, and change
it from `http://localhost:3000/api/v1` to
`https://your-project-id.web.app/api/v1` (the **web** site's URL — the
API lives there via the `/api/**` rewrite, not on the flutter site).

Then rebuild and redeploy just that site:
```bash
cd ../daong_flutter && flutter build web --release && cd ../daong
npx firebase deploy --only hosting:flutter
```

## After deploying

- Visit `https://your-project-id.web.app` — the HTML site, fully live.
- Visit `https://your-project-id-flutter.web.app` — the Flutter client.
- `npx firebase functions:log` — tail the API's logs if something
  looks wrong.
- The seed data (drives, TN-1001/1002/1003) auto-populates into
  Firestore the first time any request hits the Function — no manual
  seeding step.

## Before this goes anywhere beyond a demo

- **reCAPTCHA is off by default** and no longer ships hardcoded keys.
  Turn it on with `REQUIRE_RECAPTCHA=true` plus real credentials — see
  `README.md`'s reCAPTCHA section — before sharing this URL publicly.
- **CORS defaults to wide open** on the Function. Set `CORS_ORIGINS` to
  your actual Hosting domains; `functions/index.js` reads it. Same-origin
  requests through the `/api/**` rewrite need no CORS at all.
- **Set `ANTHROPIC_API_KEY` on the Function**, not in a file:
  `npx firebase functions:secrets:set ANTHROPIC_API_KEY`. Without it the
  assistant returns a clean 503 and the rest of the site works normally.
- **Firestore security rules deny all direct client access** (correct,
  since only the Function's Admin SDK touches Firestore) — don't
  loosen these unless you add a real reason for the browser to talk to
  Firestore directly.
- Consider Firebase App Check (already scaffolded, off by default —
  see `server/appCheck.js` and the README) once this has real traffic
  worth protecting.
