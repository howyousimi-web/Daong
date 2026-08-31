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

- `functions/` — the API, rewritten as a Cloud Function backed by
  Firestore (Cloud Functions have no durable local disk, so the flat
  JSON file `server/` uses for local dev can't work once deployed).
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` — full
  config for both Hosting sites + the Function + Firestore.
- `.firebaserc` — has `YOUR_FIREBASE_PROJECT_ID` placeholders you'll
  replace with your real project ID (step 5).

**Verified locally** via `firebase emulators:start` (no account
needed for this part): Hosting correctly serves the static site *and*
rewrites `/api/**` to the Function; the Function correctly reads/writes
Firestore (seeding, login, pledge, reCAPTCHA rejection, checkpoint
chaining, chain verification all tested); both Hosting targets (`web`
and `flutter`) serve their respective builds.

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

### 8. Deploy

```bash
npx firebase deploy
```

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

- **reCAPTCHA test keys are still in place** (frontend site key +
  backend secret key) — they accept everyone, bots included. Swap
  both for real keys (see `README.md`'s reCAPTCHA section) before
  sharing this URL publicly.
- **CORS is wide open** on the Function (`cors()` with no options) —
  restrict `origin` in `functions/index.js` to your actual Hosting
  domains.
- **Firestore security rules deny all direct client access** (correct,
  since only the Function's Admin SDK touches Firestore) — don't
  loosen these unless you add a real reason for the browser to talk to
  Firestore directly.
- Consider Firebase App Check (already scaffolded, off by default —
  see `server/appCheck.js` and the README) once this has real traffic
  worth protecting.
