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

load_dotenv_file() {
    local dotenv_path="$1"
    [ -f "$dotenv_path" ] || return 0

    while IFS= read -r raw_line || [ -n "$raw_line" ]; do
        local line="${raw_line%$'\r'}"
        # Skip comments / empty lines
        case "$line" in
            ''|'#'*) continue ;;
        esac

        # Keep only KEY=VALUE entries
        if [[ "$line" != *=* ]]; then
            continue
        fi

        local key="${line%%=*}"
        local value="${line#*=}"

        # Trim spaces around key
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"

        # Remove optional surrounding quotes from value
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
            value="${value:1:${#value}-2}"
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
            value="${value:1:${#value}-2}"
        fi

        export "$key=$value"
    done < "$dotenv_path"
}

# ── Load .env if present ──
load_dotenv_file .env

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
