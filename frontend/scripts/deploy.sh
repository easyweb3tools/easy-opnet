#!/usr/bin/env bash
set -euo pipefail

#
# AgentVault — Frontend Deployment to Cloudflare
#
# Prerequisites:
#   1. npm install (in frontend/)
#   2. wrangler login or set CLOUDFLARE_API_TOKEN
#   3. Set D1_DATABASE_ID in frontend/.env or as an environment variable
#   4. Set BACKEND_BASE_URL in frontend/.env or as an environment variable
#
# Usage:
#   ./scripts/deploy.sh              # Build + deploy
#   ./scripts/deploy.sh preview      # Build + local preview
#   ./scripts/deploy.sh build        # Build only
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

ACTION="${1:-deploy}"

# ── Load .env if present ──
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

# ── Resolve D1_DATABASE_ID ──
if [ -z "${D1_DATABASE_ID:-}" ]; then
    echo "ERROR: D1_DATABASE_ID is not set."
    echo "Set it in frontend/.env or export it as an environment variable."
    exit 1
fi

# ── Resolve BACKEND_BASE_URL ──
if [ -z "${BACKEND_BASE_URL:-}" ] && [ -n "${NEXT_PUBLIC_BACKEND_URL:-}" ]; then
    BACKEND_BASE_URL="$NEXT_PUBLIC_BACKEND_URL"
fi

if [ -z "${BACKEND_BASE_URL:-}" ]; then
    echo "ERROR: BACKEND_BASE_URL is not set."
    echo "Set it in frontend/.env (or export NEXT_PUBLIC_BACKEND_URL as fallback)."
    exit 1
fi

# ── Resolve ALLOW_MOCK_API (optional) ──
ALLOW_MOCK_API="${ALLOW_MOCK_API:-0}"

# ── Patch wrangler.jsonc in-place, restore on exit ──
cp wrangler.jsonc wrangler.jsonc.bak
trap 'mv wrangler.jsonc.bak wrangler.jsonc' EXIT

sed -i '' "s|\${D1_DATABASE_ID}|$D1_DATABASE_ID|g" wrangler.jsonc
sed -i '' "s|\${BACKEND_BASE_URL}|$BACKEND_BASE_URL|g" wrangler.jsonc
sed -i '' "s|\${ALLOW_MOCK_API}|$ALLOW_MOCK_API|g" wrangler.jsonc

echo "==> AgentVault Frontend — Cloudflare Deployment"
echo "    Action:      $ACTION"
echo "    D1 Database: $D1_DATABASE_ID"
echo "    Backend API: $BACKEND_BASE_URL"
echo "    Mock Fallback Allowed: $ALLOW_MOCK_API"
echo ""

case "$ACTION" in
    build)
        echo "==> Building with OpenNext for Cloudflare..."
        npx opennextjs-cloudflare build
        echo "==> Build complete. Output in .open-next/"
        ;;
    preview)
        echo "==> Building and starting local preview..."
        npx opennextjs-cloudflare build
        npx opennextjs-cloudflare preview
        ;;
    deploy)
        echo "==> Building and deploying to Cloudflare..."
        npx opennextjs-cloudflare build
        npx opennextjs-cloudflare deploy
        echo ""
        echo "==> Frontend deployed successfully!"
        ;;
    upload)
        echo "==> Building and uploading (without routing)..."
        npx opennextjs-cloudflare build
        npx opennextjs-cloudflare upload
        ;;
    *)
        echo "Unknown action: $ACTION"
        echo "Usage: $0 [build|preview|deploy|upload]"
        exit 1
        ;;
esac
