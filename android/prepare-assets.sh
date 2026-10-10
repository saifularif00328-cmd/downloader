#!/usr/bin/env bash
# Menyalin UI web ke assets Android dan menyisipkan shim. Jalankan dari mana saja.
set -euo pipefail
cd "$(dirname "$0")/.."
A=android/app/src/main/assets
rm -rf "$A"; mkdir -p "$A"
cp index.html styles.css app.js logo.svg "$A/"
cp android/shim/android-shim.js "$A/"
sed -i 's|<script src="app.js"></script>|<script src="android-shim.js"></script>\n<script src="app.js"></script>|' "$A/index.html"
grep -q android-shim.js "$A/index.html" || { echo "gagal menyisipkan shim"; exit 1; }
echo "assets siap: $A"
