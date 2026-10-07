#!/usr/bin/env sh
# Copies the shared backend into functions/ before a Firebase deploy.
# Firebase uploads only the functions/ directory, so the single source of
# truth in server/ has to be vendored in. Never edit functions/server/ by
# hand — it is overwritten on every build.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/functions/server"

rm -rf "$DEST"
mkdir -p "$DEST/ai"

cp "$ROOT/server/api-routes.js"   "$DEST/"
cp "$ROOT/server/store.js"        "$DEST/"
cp "$ROOT/server/auth.js"         "$DEST/"
cp "$ROOT/server/validators.js"   "$DEST/"
cp "$ROOT/server/recaptcha.js"    "$DEST/"
cp "$ROOT/server/appCheck.js"     "$DEST/"
cp "$ROOT/server/rate-limiter.js" "$DEST/"
cp "$ROOT/server/ai/ai-routes.js"  "$DEST/ai/"
cp "$ROOT/server/ai/ai-context.js" "$DEST/ai/"
cp "$ROOT/server/ai/ai-data.js"    "$DEST/ai/"

echo "Copied server/ -> functions/server/ ($(ls "$DEST" "$DEST/ai" | grep -c '\.js$') files)"
