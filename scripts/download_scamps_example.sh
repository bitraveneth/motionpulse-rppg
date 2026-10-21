#!/usr/bin/env bash
# Download the official SCAMPS 10-video example (~1.2GB) into data/SCAMPS/.
# URL scraped from https://github.com/danmcduff/scampsdataset (README may change).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${SCAMPS_DIR:-$ROOT/data/SCAMPS}"
URL="${SCAMPS_URL:-https://facesyntheticspubwedata.z6.web.core.windows.net/neurips-2022/scamps_videos_example.tar.gz}"
ARCHIVE="$DEST/scamps_videos_example.tar.gz"

mkdir -p "$DEST"
cd "$DEST"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Downloading SCAMPS example → $ARCHIVE"
  echo "URL: $URL"
  curl -L --fail --retry 3 --retry-delay 5 -o "$ARCHIVE" "$URL"
else
  echo "Archive already present: $ARCHIVE"
fi

# Extract if no .mat files yet
if ! find "$DEST" -name '*.mat' -print -quit | grep -q .; then
  echo "Extracting $ARCHIVE ..."
  tar -xzf "$ARCHIVE"
else
  echo "Found existing .mat under $DEST — skip extract"
fi

echo "Done. Mats:"
find "$DEST" -name '*.mat' | head -20
COUNT="$(find "$DEST" -name '*.mat' | wc -l | tr -d ' ')"
echo "Total .mat files: $COUNT"
echo
echo "Train:"
echo "  python3 -m research.train --config research/configs/scamps.yaml"
