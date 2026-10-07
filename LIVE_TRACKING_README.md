# DAONG Live Tracking — Google Maps

The Live Tracking page now uses the Google Maps JavaScript API and keeps the demo ESP32 tracker feed.

## One-time setup
1. In Google Cloud Console, enable **Maps JavaScript API** for your project.
2. Create a browser API key.
3. Open `public/js/google-maps-config.js`.
4. Replace `PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE` with the key.
5. For deployment, restrict the key by HTTP referrer/origin and restrict its API access to Maps JavaScript API.

Do not commit a production unrestricted key to a public repository.

## Scroll fix
The right Tracked Vehicles panel now has its own vertical scrollbar on desktop. On smaller screens it returns to normal page scrolling.

## Demo data
Tracker positions are still demo data. `public/js/live-tracking.js` is structured so the `trackers` array can later be replaced by your ESP32/backend feed.
