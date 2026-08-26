# ReliefLedger

A hackathon prototype for tracing and enforcing transparency of donations
during calamities. Every donation and disbursement is appended to a
SHA-256 hash-chained public ledger per campaign, so anyone can verify
nothing was silently edited after the fact.

Runs out of the box against an in-memory mock backend — no setup needed
for a demo. Real Firebase + reCAPTCHA are wired in and activate
automatically once configured (see below); until then they no-op safely.

## Quick start

```bash
flutter pub get
flutter run -d chrome
```

## Architecture

- `lib/services/api_service.dart` — the interface every screen codes
  against. Three interchangeable implementations:
  - `mock_api_service.dart` — in-memory, seeded, zero setup (default).
  - `firebase_api_service.dart` — Cloud Firestore backend.
  - `http_api_service.dart` — plain REST backend, ready for a custom API.
- `lib/main.dart` — composition root. Picks Firebase if configured,
  otherwise falls back to mock, so a broken backend never breaks the demo.

## Enabling Firebase

1. Install the CLI once: `dart pub global activate flutterfire_cli`
2. From the project root: `flutterfire configure` — pick/create a
   Firebase project, select **Web**. This overwrites
   `lib/firebase_options.dart` with your real project keys.
3. In `lib/firebase_options.dart`, set `kIsFirebaseConfigured = true`.
4. Enable **Cloud Firestore** in the Firebase console (start in test
   mode for the hackathon, then lock it down with the security rules
   sketched in `firebase_api_service.dart`).
5. Run the app — on first launch it seeds a demo campaign into Firestore
   automatically (`seedDemoCampaignsIfEmpty`).

## Enabling reCAPTCHA

Two separate integrations, both already wired up:

**1. Visible checkbox on the Donate form** (`lib/widgets/recaptcha_widget.dart`)
Ships with Google's public reCAPTCHA v2 **test** site key, so it renders
and "passes" immediately with zero setup — good enough to demo Friday.
Before using this anywhere real:
- Register a site at https://www.google.com/recaptcha/admin (type: v2
  checkbox), add your real domain.
- Replace `kRecaptchaTestSiteKey` in `recaptcha_widget.dart` with your key.
- Send the resulting token to your backend and verify it server-side via
  Google's `siteverify` endpoint before trusting the submission — the
  client-side check alone can be bypassed by anyone calling your API
  directly.

**2. Firebase App Check with reCAPTCHA v3** (`lib/main.dart`)
Silently attests that Firestore calls come from a real browser, not a
script — the anti-abuse layer for the *backend*, not the form.
- Register a **v3** site at the same reCAPTCHA admin console.
- In the Firebase console: App Check → register your web app → provider
  reCAPTCHA v3 → paste the same site key.
- Set `kRecaptchaV3SiteKey` in `lib/main.dart` to that key.
- Enforce App Check on Firestore once you've confirmed real traffic
  passes (App Check → Firestore → Enforce).

## Known limits (prototype, not production)

- The hash chain is computed and verified client-side for the demo;
  a production build should compute/verify it server-side (e.g. a
  Cloud Function) so a compromised client can't fabricate a valid chain.
- No auth yet — the "Org: Log Distribution" action should sit behind
  Firebase Auth + role checks before this goes anywhere real.
- reCAPTCHA tokens aren't currently verified server-side (see above).
