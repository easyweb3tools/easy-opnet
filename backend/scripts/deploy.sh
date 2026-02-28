#!/usr/bin/env bash
set -euo pipefail

#
# AgentVault — Backend Deployment to Cloudflare Workers
#
# Deploys the Hono backend as a Cloudflare Worker using wrangler.
# Uses nodejs_compat for full Node.js API support.
#
# Prerequisites:
#   1. npm install (in backend/)
#   2. wrangler login (one-time)
#   3. Set D1_DATABASE_ID in backend/.env or environment
#   4. Set PINATA_JWT in backend/.env (deploy script auto-syncs it to Wrangler secret)
#
# Usage:
#   ./scripts/deploy.sh                  # Deploy (default env)
#   ./scripts/deploy.sh staging          # Deploy to staging
#   ./scripts/deploy.sh production       # Deploy to production
#   ./scripts/deploy.sh dev              # Local CF Workers dev server
#   ./scripts/deploy.sh secret <KEY>     # Set a secret
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

echo "==> AgentVault Backend — Cloudflare Workers Deployment"
echo "    Action: $ACTION"
echo ""

prepare_nft_wasm() {
    if [ "${SKIP_WASM_BUILD:-0}" = "1" ]; then
        echo "==> Skipping NFT WASM build (SKIP_WASM_BUILD=1)"
        return 0
    fi

    echo "==> Building and syncing NFT WASM (contracts -> backend/contracts)..."
    (
        cd ../contracts
        npm run build:nft:copy
    )
}

prepare_wrangler_config() {
    if [ -z "${D1_DATABASE_ID:-}" ]; then
        echo "ERROR: D1_DATABASE_ID is not set."
        echo "Set it in backend/.env or export it as an environment variable."
        exit 1
    fi

    cp wrangler.toml wrangler.toml.bak
    trap 'mv wrangler.toml.bak wrangler.toml' EXIT
    sed -i '' "s|\${D1_DATABASE_ID}|$D1_DATABASE_ID|g" wrangler.toml
}

sync_pinata_secret() {
    local target_env="${1:-}"

    if [ -z "${PINATA_JWT:-}" ]; then
        echo "ERROR: PINATA_JWT is not set."
        echo "Set it in backend/.env or export it as an environment variable."
        exit 1
    fi

    echo "==> Syncing Wrangler secret: PINATA_JWT${target_env:+ (env: $target_env)}"
    if [ -n "$target_env" ]; then
        printf '%s' "$PINATA_JWT" | npx wrangler secret put PINATA_JWT --env "$target_env"
    else
        printf '%s' "$PINATA_JWT" | npx wrangler secret put PINATA_JWT
    fi
}

case "$ACTION" in
    dev)
        echo "==> Starting local CF Workers dev server..."
        npx wrangler dev
        ;;
    deploy)
        prepare_nft_wasm
        prepare_wrangler_config
        sync_pinata_secret
        echo "==> Deploying to Cloudflare Workers..."
        npx wrangler deploy
        echo ""
        echo "==> Backend deployed successfully!"
        ;;
    staging)
        prepare_nft_wasm
        prepare_wrangler_config
        sync_pinata_secret "staging"
        echo "==> Deploying to staging..."
        npx wrangler deploy --env staging
        echo ""
        echo "==> Backend deployed to staging!"
        ;;
    production)
        prepare_nft_wasm
        prepare_wrangler_config
        sync_pinata_secret "production"
        echo "==> Deploying to production..."
        npx wrangler deploy --env production
        echo ""
        echo "==> Backend deployed to production!"
        ;;
    secret)
        KEY="${2:-}"
        if [ -z "$KEY" ]; then
            echo "Usage: $0 secret <KEY_NAME>"
            echo ""
            echo "Required secrets:"
            echo "  WALLET_MNEMONIC              BIP39 mnemonic for agent wallet"
            echo "  PINATA_JWT                   Pinata API JWT for IPFS uploads"
            echo "  MARKETPLACE_CONTRACT_ADDRESS Deployed marketplace contract address"
            exit 1
        fi
        echo "==> Setting secret: $KEY"
        npx wrangler secret put "$KEY"
        ;;
    typecheck)
        echo "==> Running typecheck..."
        npx tsc --noEmit
        echo "==> Typecheck passed!"
        ;;
    *)
        echo "Unknown action: $ACTION"
        echo ""
        echo "Usage: $0 [dev|deploy|staging|production|secret|typecheck]"
        echo ""
        echo "  dev          Start local CF Workers dev server"
        echo "  deploy       Deploy to Cloudflare Workers (default)"
        echo "  staging      Deploy to staging environment"
        echo "  production   Deploy to production environment"
        echo "  secret <KEY> Set a Worker secret"
        echo "  typecheck    Run TypeScript type checking"
        exit 1
        ;;
esac
