#!/usr/bin/env bash
# Generate the multi-size PNG icon set electron-builder installs under
# /usr/share/icons/hicolor, from the 1024x1024 master in assets/icon.png.
# Run after changing the app icon, then rebuild the .deb.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT_DIR}/assets/icon.png"
OUT_DIR="${ROOT_DIR}/build/icons"

if ! command -v convert >/dev/null 2>&1; then
    echo "ImageMagick 'convert' not found; install imagemagick" >&2
    exit 1
fi

mkdir -p "${OUT_DIR}"
for size in 16 24 32 48 64 128 256 512 1024; do
    convert "${SRC}" -resize "${size}x${size}" "${OUT_DIR}/${size}x${size}.png"
done

echo "Generated icon set in ${OUT_DIR}"
