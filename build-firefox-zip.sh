#!/usr/bin/env bash
# Builds anti-instagram-js-firefox.zip for Firefox / LibreWolf.
# Firefox requires background.scripts (event pages) — it does not support
# MV3 background.service_worker — so the zip swaps in manifest.firefox.json.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/anti-instagram-js-firefox.zip"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

cp "$DIR"/background.js "$DIR"/content.js "$DIR"/styles.css \
   "$DIR"/popup.html "$DIR"/popup.css "$DIR"/popup.js "$BUILD_DIR/"
cp -r "$DIR/icons" "$BUILD_DIR/"
cp "$DIR/manifest.firefox.json" "$BUILD_DIR/manifest.json"

rm -f "$OUT"
(cd "$BUILD_DIR" && zip -qr "$OUT" .)
echo "Built $OUT"
