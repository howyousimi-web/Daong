# DAONG deployment without the Blaze plan

This project originally assumes Firebase Cloud Functions + Firestore.
That is the setup that needs the Blaze pay-as-you-go plan.

If you want to avoid Blaze entirely, use:

- Firebase Hosting for the frontend
- Firebase Authentication for sign-in
- A separate Express API on a non-Firebase host (Render, Railway, Fly.io,
  DigitalOcean, VPS, etc.)
- A database on that same host or in a provider that does not require
  Cloud Functions

## Recommended architecture

- Frontend: Firebase Hosting
- Auth: Firebase Auth
- API: Express app on a normal Node host
- Database: Postgres / Supabase / Neon / MongoDB / or your existing app DB

This repo is still compatible with that setup because the frontend reads
its API URL from `public/js/config.js` and the backend is a standard
Express app under `server/`.

## 1) Firebase Hosting only

```bash
firebase login
firebase init hosting
firebase deploy --only hosting
```

If you already have a project configured, keep it simple:

```bash
firebase deploy --only hosting
```

## 2) Point the frontend at your external API

Edit `public/js/config.js` and set:

```js
window.DAONG_CONFIG = {
  apiBaseUrl: 'https://your-api-domain.example.com/api/v1'
};
```

Or if you are loading the file normally, just update the default value in
that file before deployment.

## 3) Allow CORS on the backend

In your Express server `.env` set:

```env
CORS_ORIGINS=https://your-firebase-hosting-domain.web.app
```

If the backend is not hosted behind the same domain, make sure the API
allows your Hosting origin.

## 4) Keep Firebase Authentication

You can still use Firebase Auth without Functions or Firestore. The
project already contains Firebase config in `firebase.json` for auth.

## 5) Avoid Cloud Functions entirely

Do not deploy the Functions runtime or Firestore resources for this
version of the app if you want to stay on the free/no-Blaze path.

This app's original `firebase.json` included:

- `functions`
- `firestore`

Those are the pieces that trigger the need for a Blaze plan.

The revised `firebase.json` in this repo removes those entries so Hosting
and Auth can be used without Functions.

## 6) Backend hosting examples

A few no-Blaze options:

- Render
- Railway
- Fly.io
- DigitalOcean App Platform
- VPS with PM2

Pick whichever is simplest for running Node + Express.
