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
#   3. Set secrets:
#        npm run cf:secret WALLET_MNEMONIC
#        npm run cf:secret PINATA_JWT
#        npm run cf:secret NFT_CONTRACT_ADDRESS
#        npm run cf:secret MARKETPLACE_CONTRACT_ADDRESS
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

echo "==> AgentVault Backend — Cloudflare Workers Deployment"
echo "    Action: $ACTION"
echo ""

case "$ACTION" in
    dev)
        echo "==> Starting local CF Workers dev server..."
        npx wrangler dev
        ;;
    deploy)
        echo "==> Deploying to Cloudflare Workers..."
        npx wrangler deploy
        echo ""
        echo "==> Backend deployed successfully!"
        ;;
    staging)
        echo "==> Deploying to staging..."
        npx wrangler deploy --env staging
        echo ""
        echo "==> Backend deployed to staging!"
        ;;
    production)
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
            echo "  NFT_CONTRACT_ADDRESS         Deployed NFT contract address"
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
