# Repository Guidelines

## Project Structure & Module Organization
This repository is split into three main packages plus shared docs:
- `frontend/`: Next.js app (`src/app`, `src/components`, `src/lib`, `public/`).
- `backend/`: Hono + TypeScript API/worker (`src/routes`, `src/market`, `src/agents`, `src/nft`).
- `contracts/`: OPNet AssemblyScript smart contracts (`src/`, output in `build/`).
- `docs/`: project documentation.  
Use the top-level `Makefile` to run cross-package tasks from the repo root.

## Build, Test, and Development Commands
Key root commands:
- `make install`: install dependencies in `contracts`, `frontend`, and `backend`.
- `make build`: build contracts, backend, and frontend.
- `make typecheck`: run strict TypeScript checks for frontend and backend.
- `make lint`: run ESLint checks for frontend and backend.
- `make dev`: run frontend and backend dev servers in parallel.
- `make deploy`, `make deploy-staging`, `make deploy-production`: Cloudflare deploy flows.

Package-level examples:
- `cd contracts && npm run build`
- `cd backend && npm run dev`
- `cd frontend && npm run dev`

## Coding Style & Naming Conventions
- Languages: TypeScript (`frontend`, `backend`) and AssemblyScript (`contracts`).
- Keep existing style per package: frontend files commonly use 2-space indentation; backend/contracts use 4 spaces.
- Follow existing quote/import style in the file you edit.
- React components: `PascalCase` filenames (example: `ListingCard.tsx`).
- Route segments in `frontend/src/app` are lowercase (example: `explore/page.tsx`).
- Run `make lint` and `make typecheck` before opening a PR.

## Testing Guidelines
There is no full automated test suite yet. Treat these as required checks:
- `make typecheck`
- `make lint`
- `make build`
- Backend smoke test: `curl http://localhost:3001/health` and `curl http://localhost:3001/api/public/stats`
For UI/API behavior changes, include manual verification steps in the PR.

## Commit & Pull Request Guidelines
Current history uses short, imperative commit subjects (example: `add deploy`).
- Keep subject lines concise and action-oriented.
- One logical change per commit.
- PRs should include: purpose, touched areas (`frontend`/`backend`/`contracts`), verification commands run, and linked issue/task.
- Include screenshots for frontend visual changes and note any required env vars or migration steps.

## Security & Configuration Tips
- Copy env templates (`backend/.env.example`, `frontend/.env.example`) when setting up locally.
- Never commit secrets (`.env`, private keys, mnemonics, API tokens).
