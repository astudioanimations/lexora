#!/usr/bin/env bash
#
# Lexora deploy helper.
# Run from INSIDE the Lexora/ project folder:  bash deploy.sh
#
# Covers Step 1 (GitHub) and Step 5 (push-to-deploy).
# Steps 2–4 (Connect to Git + build settings) are dashboard clicks — see DEPLOY.md.
# OR skip the dashboard entirely with the Wrangler section at the bottom.

set -e  # stop on first error

# ---- EDIT THIS ----
GH_USERNAME="tessera11"     # <-- your GitHub username
REPO="Lexora"
# -------------------

echo "==> Sanity checks"
command -v git  >/dev/null || { echo "Git not installed: https://git-scm.com"; exit 1; }
command -v node >/dev/null || { echo "Node not installed: https://nodejs.org"; exit 1; }
[ -f package.json ] || { echo "Run this from inside the Lexora/ folder (no package.json here)."; exit 1; }
echo "    node $(node --version), git $(git --version | awk '{print $3}')"

echo "==> Verify the project builds before deploying"
npm install
npm run build          # fails here if there are TS errors — fix locally first

echo "==> Step 1: initialise Git + first commit"
printf "node_modules/\ndist/\n.DS_Store\n" > .gitignore
printf "20\n" > .nvmrc          # pins Node 20 for Cloudflare's build
if [ ! -d .git ]; then
  git init
  git branch -M main
fi
git add .
git commit -m "Lexora v1 — initial commit" || echo "    (nothing new to commit)"

echo "==> Link GitHub remote + push"
if git remote get-url origin >/dev/null 2>&1; then
  echo "    remote 'origin' already set: $(git remote get-url origin)"
else
  git remote add origin "https://github.com/${GH_USERNAME}/${REPO}.git"
fi
git push -u origin main

cat <<'NEXT'

==> DONE with the Git side.

Now do Steps 2–4 ONCE in the Cloudflare dashboard:
  1. Workers & Pages -> Create -> Pages -> "Connect to Git"  (NOT Direct Upload)
  2. Pick the 'Lexora' repo
  3. Build command:  npm run build
     Output dir:     dist
     Env var:        NODE_VERSION = 20
  4. Save and Deploy

After that, Step 5 is automatic — just rerun the push snippet below anytime:

  git add . && git commit -m "your message" && git push

NEXT
