# DAONG (monorepo)

Two frontends, one backend:

```
daong_project/
  daong/            Node/Express backend + HTML/CSS/JS frontend
  daong_flutter/    Flutter web client for the same backend
```

Both frontends talk to the **same** API (`daong/server`) — they don't
know about each other and never share code directly. "Merging" them
just means keeping them in one place with one set of run instructions,
which is what this folder is.

## Run everything

**1. Start the backend first** — both frontends need it running.

```bash
cd daong
npm install
npm start
```

This serves the HTML frontend **and** the API together at
**http://localhost:3000**. Leave this terminal running.

**2. (Optional) Also run the Flutter client**, in a second terminal:

```bash
cd daong_flutter
flutter pub get
flutter run -d chrome
```

It connects to `http://localhost:3000/api/v1` — set by
`kDaongApiBaseUrl` in `daong_flutter/lib/main.dart` if you ever move
the backend elsewhere.

That's it — you don't need to run both every time. Use the HTML site
alone, the Flutter client alone (backend still required), or both side
by side to compare them.

### Windows convenience scripts

From this folder:
- `start-backend.bat` — installs deps if needed, then starts the backend.
- `start-flutter.bat` — installs deps if needed, then runs the Flutter client.

Double-click either, or run them from PowerShell/cmd. Start the backend
one first.

## Why they're separate folders, not one codebase

- `daong/public` (HTML/JS) and `daong_flutter` (Dart) are different
  languages/runtimes — there's no way to combine their *source* into
  one tree, only to run them against one shared backend, which they
  already do.
- Keeping `daong_flutter` a sibling (not nested inside `daong/`) means
  `daong` alone is still exactly what you'd hand to a teammate who only
  wants the backend + web frontend — see `daong/README.md`'s
  "Using the backend on its own" section for that case.

## If you'd rather have this as one Git repo

```bash
cd daong_project
git init
git add .
git commit -m "Initial commit: daong backend+web, daong_flutter client"
```

Both `daong/.gitignore` and `daong_flutter/.gitignore` are already in
place (they exclude `node_modules/`, `data/db.json`, `.dart_tool/`,
`build/`), so a single `git init` at this root correctly ignores both
projects' generated files without any extra config.

## Full documentation

- [`daong/README.md`](daong/README.md) — backend API reference, Firebase
  App Check / reCAPTCHA / Google Maps setup, architecture.
- [`daong_flutter/README.md`](daong_flutter/README.md) — Flutter client
  architecture, what's verified, known limits.
