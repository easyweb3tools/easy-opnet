.PHONY: help install build typecheck lint dev clean \
       install-contracts install-frontend install-backend \
       build-contracts build-frontend build-backend \
       typecheck-frontend typecheck-backend \
       lint-frontend lint-backend \
       dev-frontend dev-backend \
       deploy deploy-frontend deploy-backend \
       deploy-staging deploy-production \
       clean-contracts clean-frontend clean-backend

# ──────────────────────────────────────────────
# AgentVault — Monorepo Makefile
# ──────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ── Install ──────────────────────────────────

install: install-contracts install-frontend install-backend ## Install all dependencies

install-contracts: ## Install contracts dependencies
	cd contracts && npm install

install-frontend: ## Install frontend dependencies
	cd frontend && npm install

install-backend: ## Install backend dependencies
	cd backend && npm install

# ── Build ────────────────────────────────────

build: build-contracts build-backend build-frontend ## Build all projects

build-contracts: ## Build smart contracts (WASM)
	cd contracts && npm run build

build-frontend: ## Build frontend (Next.js)
	cd frontend && npm run build

build-backend: ## Build backend (TypeScript)
	cd backend && npm run build

# ── Typecheck ────────────────────────────────

typecheck: typecheck-frontend typecheck-backend ## Typecheck frontend + backend

typecheck-frontend: ## Typecheck frontend
	cd frontend && npm run typecheck

typecheck-backend: ## Typecheck backend
	cd backend && npm run typecheck

# ── Lint ─────────────────────────────────────

lint: lint-frontend lint-backend ## Lint frontend + backend

lint-frontend: ## Lint frontend
	cd frontend && npm run lint

lint-backend: ## Lint backend
	cd backend && npm run lint

# ── Dev ──────────────────────────────────────

dev-frontend: ## Start frontend dev server
	cd frontend && npm run dev

dev-backend: ## Start backend dev server (Node.js)
	cd backend && npm run dev

dev: ## Start frontend + backend dev servers (parallel)
	@make -j2 dev-frontend dev-backend

# ── Deploy (Cloudflare) ─────────────────────

deploy: deploy-frontend deploy-backend ## Deploy frontend + backend to Cloudflare

deploy-frontend: ## Deploy frontend to Cloudflare
	cd frontend && bash scripts/deploy.sh

deploy-backend: ## Deploy backend to Cloudflare Workers
	cd backend && bash scripts/deploy.sh deploy

deploy-staging: ## Deploy backend to staging
	cd backend && bash scripts/deploy.sh staging

deploy-production: ## Deploy backend to production
	cd backend && bash scripts/deploy.sh production

# ── Clean ────────────────────────────────────

clean: clean-contracts clean-frontend clean-backend ## Clean all build artifacts

clean-contracts: ## Clean contracts build output
	rm -rf contracts/build

clean-frontend: ## Clean frontend build output
	rm -rf frontend/.next frontend/.open-next frontend/out

clean-backend: ## Clean backend build output
	rm -rf backend/dist backend/.wrangler
