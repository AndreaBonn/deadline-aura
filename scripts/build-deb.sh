#!/usr/bin/env bash
# Build the DeadlineAura .deb locally.
#
# electron-builder rebuilds the native modules (better-sqlite3, canvas) against
# the bundled Electron ABI on its own, so no manual electron-rebuild is needed.
# The resulting package lands in dist/.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Installing dependencies"
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

echo "==> Building .deb with electron-builder"
npm run dist

echo "==> Done. Artifacts:"
ls -1 dist/*.deb 2>/dev/null || {
    echo "No .deb produced — check the electron-builder output above." >&2
    exit 1
}
