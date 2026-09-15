#!/usr/bin/env bash
# Local setup for IFClite Desktop on WSL / Linux.
# Clone from Cursor Origin, install Node deps, print the next command.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required. Install from https://nodejs.org/ then re-run."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22+ is required (found $(node -v))."
  exit 1
fi

echo "Installing npm packages…"
npm install

echo
echo "Setup finished."
echo "  Browser preview:  npm run dev"
echo "  Then open http://127.0.0.1:43127 and click Load sample"
echo "  Native Tauri:     npm run dev:desktop   (needs Rust 1.88+ and WebKit/WebView2)"
