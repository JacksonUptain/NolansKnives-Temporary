#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

commit_message="Deploy $(date '+%Y-%m-%d %H:%M %Z')"

command -v git >/dev/null || {
  echo "Git is required to create and push the release commit." >&2
  exit 2
}

command -v firebase >/dev/null || {
  echo "Firebase CLI is required. Install it and run: firebase login" >&2
  exit 2
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Run this command from inside the project's Git repository." >&2
  exit 2
}

if [[ -n "$(git status --porcelain)" ]]; then
  echo
  echo "These files will be included in the release commit:"
  git status --short
  echo
  echo "Committing all listed changes as '$commit_message'..."
  git add --all
  git commit -m "$commit_message"
else
  echo "No uncommitted changes; using the current commit."
fi

echo "Pushing Git commits..."
git push

echo "Deploying Firebase Functions and rules..."
npm run deploy:backend

echo "Deploying the website..."
npm run deploy:web

echo "Publishing complete. Running post-deploy verification next..."
