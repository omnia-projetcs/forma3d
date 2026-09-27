#!/usr/bin/env bash
# Optional local HTTP server. No network installation, no remote binding.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if command -v node >/dev/null 2>&1; then
  exec node server.mjs
elif command -v python3 >/dev/null 2>&1; then
  printf 'FORMA 3D — http://127.0.0.1:8080\nCtrl+C to stop / pour arrêter.\n'
  exec python3 -m http.server 8080 --bind 127.0.0.1
else
  printf 'Open FORMA3D.html in your browser / Ouvrez FORMA3D.html dans votre navigateur.\n'
  command -v xdg-open >/dev/null 2>&1 && exec xdg-open "$PWD/FORMA3D.html"
fi
