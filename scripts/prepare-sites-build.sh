#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"

test -f "$project_dir/build/index.html" || {
  echo "Run npm run build before preparing the Sites bundle." >&2
  exit 2
}

mkdir -p "$project_dir/dist/server" "$project_dir/dist/client"
cp -R "$project_dir/build"/. "$project_dir/dist/client"/
cp "$project_dir/hosting/sites-worker.js" "$project_dir/dist/server/index.js"
