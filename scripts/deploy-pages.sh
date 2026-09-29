#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
npm run build
PUBLISH_DIR="$(mktemp -d "${TMPDIR:-/tmp}/luma-pages-XXXXXX")"
cleanup() { git worktree remove --force "$PUBLISH_DIR" >/dev/null 2>&1 || true; }
trap cleanup EXIT
if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch origin gh-pages
  git worktree add --detach "$PUBLISH_DIR" FETCH_HEAD
  git -C "$PUBLISH_DIR" rm -r --ignore-unmatch .
else
  git worktree add --detach "$PUBLISH_DIR" HEAD
  git -C "$PUBLISH_DIR" switch --orphan gh-pages
fi
cp -a "$ROOT_DIR/dist/." "$PUBLISH_DIR/"
git -C "$PUBLISH_DIR" add .
if git -C "$PUBLISH_DIR" diff --cached --quiet; then
  printf 'Pages already contains this build.\n'
  exit 0
fi
git -C "$PUBLISH_DIR" commit -m "Deploy Luma from $(git rev-parse --short HEAD)"
git -C "$PUBLISH_DIR" push origin HEAD:gh-pages
