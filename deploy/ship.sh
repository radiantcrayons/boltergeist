#!/usr/bin/env bash
# Ships what's committed to Vercel production: checks it, then deploys a clean copy of HEAD, so
# nothing on disk that git doesn't have can go live.
#
#   deploy/ship.sh [vercel deploy options, such as --scope <team>]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! git diff --quiet HEAD; then
  echo "uncommitted changes: commit or stash them first" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

npx tsc --noEmit --incremental false
if [[ -d infra/node_modules ]]; then (cd infra && npx tsc --noEmit); fi
git ls-files -z -- '*.ts' '*.tsx' '*.mjs' | xargs -0 npx eslint --no-warn-ignored
npm test
if docker info >/dev/null 2>&1; then
  npm run test:db
else
  echo "the database tests were skipped: Docker isn't running" >&2
fi

if git remote get-url origin >/dev/null 2>&1; then git push; fi

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
git archive HEAD | tar -x -C "$out"
cp -R .vercel "$out/.vercel"
# Without Vercel's build cache, so a CSS change can't ship with the cached CSS from before it.
npx --yes vercel@64.2.0 deploy --prod --yes --force --cwd "$out" "$@"
