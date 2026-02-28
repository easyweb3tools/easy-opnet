# AgentVault — Flow Test Report & Codex Handoff

> Tested: 2026-02-28
> Tester: Claude (Product Design & QA)
> Target: https://www.easyweb3.tools (production)
> Test project: `test-agent-01/`

---

## Executive Summary

Tested the full agent onboarding flow from `skill.md` as an AI agent would experience it. **The core signing/crypto flow works**, but the production deployment is entirely mock data — no request reaches the real Hono backend. There are also several documentation errors in `skill.md` that would block real agents.

**Priority classification:**
- P0 = Agents cannot complete the flow at all
- P1 = Agents will encounter confusing errors
- P2 = Documentation/polish issues

---

## Issues Found

### ISSUE-001 [P0]: Production API serves mock data, not the real backend

**Description:** All 12 API endpoints at `https://www.easyweb3.tools/api/*` are served by Next.js API route files in the frontend (`frontend/src/app/api/**/*.ts`), which return **hardcoded mock data**. The Hono backend (`backend/`) is deployed as a separate Cloudflare Worker (`agentvault-backend`) but is **never reached** by production requests.

**Evidence:**
- `GET /api/public/stats` → returns `MOCK_STATS` from `frontend/src/lib/mock-data.ts`
- `POST /api/agent/register` → returns `{ txHash: "0xmock_register_..." }` without any on-chain interaction
- All listing/agent data contains fake addresses like `bc1q-cipher-agent-xxx...`

**Root cause:** The frontend Cloudflare Pages deployment handles all `/api/*` routes via Next.js route handlers. There is no proxy/rewrite to the backend worker. The backend worker is deployed but orphaned — nothing routes to it.

**Fix options:**
1. **Proxy approach**: Configure Next.js rewrites in `next.config.ts` to forward `/api/*` to the backend worker URL
2. **Unified approach**: Merge the backend Hono app into the frontend's Next.js API routes (replace mock handlers with calls to the backend services)
3. **DNS approach**: Use Cloudflare routing rules to split `/api/*` traffic to the backend worker and `/*` to the frontend Pages

**Files involved:**
- `frontend/src/app/api/**/*.ts` — all 12 mock route files
- `frontend/next.config.ts` — needs rewrites added
- `backend/wrangler.toml` — backend worker config
- `frontend/wrangler.jsonc` — frontend pages config

---

### ISSUE-002 [P0]: `@btc-vision/bitcoin` version mismatch — `networks.opnetTestnet` doesn't exist in stable release

**Description:** `skill.md` tells agents to install `@btc-vision/bitcoin` which resolves to v6.5.6 (stable). But `networks.opnetTestnet` only exists in v7.0.0-rc.6 (release candidate). The backend uses v7 RC; agents installing from npm get v6.

**Evidence:**
```
$ npm install @btc-vision/bitcoin   → installs 6.5.6
$ node -e "import {networks} from '@btc-vision/bitcoin'; console.log(Object.keys(networks))"
→ NO "opnetTestnet" in the list
```

After installing `@btc-vision/bitcoin@7.0.0-rc.6`, `networks.opnetTestnet` is available.

**Impact:** Wallet generation fails silently or uses wrong network. Agent addresses may be invalid.

**Fix:** Update `skill.md` to specify the exact version:
```bash
npm install @btc-vision/transaction @btc-vision/bitcoin@7.0.0-rc.6
```

**Files:** `frontend/public/skill.md`

---

### ISSUE-003 [P1]: Address prefix is `opt1p...`, not `tb1p...` as documented

**Description:** `skill.md` says OPNet testnet addresses look like `tb1p...`. In reality, `networks.opnetTestnet` uses bech32 prefix `opt`, producing addresses like `opt1p...`.

**Evidence:**
```
networks.opnetTestnet.bech32 = "opt"
Generated address: opt1pcnyvxgjge0jsscsyjwyev6gqfmgcjkg3d7943epz2dd2nyp2er9qdu3h5w
```

**Impact:** Agents seeing `opt1p...` addresses may think something is wrong. Documentation examples showing `tb1p...` are misleading.

**Fix:** Update all `tb1p...` references in `skill.md` to `opt1p...`. Update the wallet properties table.

**Files:** `frontend/public/skill.md`

---

### ISSUE-004 [P1]: `MessageSigner.signMLDSAMessage()` returns an object, not raw bytes

**Description:** `skill.md` documents the signing flow as:
```typescript
const signatureBytes = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, bodyString);
const signatureHex = Buffer.from(signatureBytes).toString('hex');
```

But `signMLDSAMessage` returns `{ signature, message, publicKey, securityLevel }`, not raw bytes. Calling `Buffer.from(result)` on the object throws:
```
TypeError: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received an instance of Object
```

**Fix:** Update `skill.md`:
```typescript
const signResult = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, bodyString);
const signatureHex = Buffer.from(signResult.signature).toString('hex');
```

**Files:** `frontend/public/skill.md`

---

### ISSUE-005 [P1]: `mnemonic.zeroize()` does not exist

**Description:** `skill.md` Step 1 "Clean Up Sensitive Data" section says:
```typescript
mnemonic.zeroize();
wallet.zeroize();
```

But `Mnemonic` instances do not have a `zeroize()` method in the installed version. This throws:
```
TypeError: mnemonic.zeroize is not a function
```

**Fix:** Either remove the cleanup section or add a guard:
```typescript
if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
if (typeof wallet.zeroize === 'function') wallet.zeroize();
```

**Files:** `frontend/public/skill.md`

---

### ISSUE-006 [P0]: Balance endpoint (`GET /api/public/balance/:address`) returns 404 in production

**Description:** We added `GET /api/public/balance/:address` to the Hono backend, but there's no corresponding Next.js route file in the frontend. Since production routes all API requests through Next.js, this endpoint returns a 404 HTML page.

**Evidence:**
```
curl https://www.easyweb3.tools/api/public/balance/opt1p...
→ HTML 404 page from Next.js
```

**Fix:** Create `frontend/src/app/api/public/balance/[address]/route.ts` — either with mock data or as a proxy to the backend.

**Files:** `frontend/src/app/api/public/balance/[address]/route.ts` (new)

---

### ISSUE-007 [P2]: `AgentAuthService.ts` address derivation may not match OPNet standard

**Description:** The backend's `AgentAuthService.ts` derives the agent address from the ML-DSA public key as:
```typescript
const keyHash = createHash('sha256').update(pubKeyBytes).digest('hex');
const address = `bc1q${keyHash.slice(0, 38)}`;
```

This produces a `bc1q...` address (mainnet bech32), not an `opt1p...` address (OPNet testnet). Also, the derivation (SHA-256 → slice → bech32) doesn't match how the wallet library derives P2TR addresses.

**Impact:** The "verified" address returned by the auth middleware won't match the agent's actual P2TR address. This means agent-specific operations (e.g., "only the listing owner can cancel") may fail or match incorrectly.

**Fix:** The address derivation needs to either:
1. Match the wallet library's P2TR derivation logic, OR
2. Use the P2TR address sent by the agent as a body field and verify it matches the public key

**Files:** `backend/src/agents/AgentAuthService.ts`

---

### ISSUE-008 [P2]: Contracts not deployed — all on-chain calls will fail

**Description:** The deploy script (`backend/scripts/deploy-contracts.ts`) exists but has never been run. `NFT_CONTRACT_ADDRESS` and `MARKETPLACE_CONTRACT_ADDRESS` in `.env` are empty/undefined. Any request to the wired backend would fail with contract call errors.

**Prerequisite:** A funded wallet on OPNet testnet (Signet fork) is needed before deployment.

**Fix:**
1. Generate or fund a wallet on OPNet testnet
2. Run `npm run deploy:contracts`
3. Update `.env` with the deployed addresses

**Files:** `backend/scripts/deploy-contracts.ts`, `backend/.env`

---

## Test Flow Results

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Generate wallet (`Mnemonic.generate`) | Works with correct `@btc-vision/bitcoin` version | PASS (with caveat: needs v7 RC) |
| 1 | Address format | `opt1p...` generated, not `tb1p...` as documented | FAIL (docs wrong) |
| 2 | Sign request body (`MessageSigner.signMLDSAMessage`) | Works — returns `{ signature, ... }` object | PASS (docs wrong about return type) |
| 2 | Verify signature round-trip | Sign + verify both pass | PASS |
| 2 | Register via API | Returns mock `txHash` — no real on-chain tx | FAIL (mock data) |
| 3 | Check balance via `/api/public/balance/:address` | 404 — endpoint missing in frontend | FAIL |
| 3 | Check balance via `/api/public/agent/:address` | Returns mock data | PASS (mock) |
| 4 | `GET /api/public/stats` | Returns mock stats | PASS (mock) |
| 4 | `GET /api/public/listings` | Returns mock listings | PASS (mock) |
| 4 | `GET /api/public/listing/:id` | Works with mock IDs (`listing-012`) | PASS (mock) |
| 4 | `GET /api/public/nft/:tokenId` | Returns mock NFT | PASS (mock) |
| 4 | `GET /api/public/agent/:address` | Returns mock agent | PASS (mock) |
| 4 | `GET /api/public/activity` | Returns mock activity | PASS (mock) |

---

## Architecture Diagram (Current Production)

```
                    www.easyweb3.tools
                          │
                ┌─────────▼──────────┐
                │  Cloudflare Pages   │
                │  (Next.js + API)    │
                │                     │
                │  /api/* → Next.js   │◄── ALL API calls served here
                │    route handlers   │    (returns MOCK DATA)
                │                     │
                │  /* → Next.js       │
                │    pages/components │
                └─────────────────────┘

                ┌─────────────────────┐
                │  Cloudflare Worker  │
                │  (Hono backend)     │◄── ORPHANED — nothing routes here
                │  agentvault-backend │
                │                     │
                │  Has wired code but │
                │  no traffic reaches │
                │  it                 │
                └─────────────────────┘
```

## Target Architecture

```
                    www.easyweb3.tools
                          │
              ┌───────────┼───────────┐
              │                       │
    ┌─────────▼──────────┐  ┌────────▼────────┐
    │  Cloudflare Pages   │  │ Cloudflare Worker│
    │  (Next.js frontend) │  │ (Hono backend)   │
    │                     │  │                  │
    │  /* → pages         │  │ /api/* → Hono    │
    │  (NO /api/ routes)  │  │   real on-chain  │
    └─────────────────────┘  │   interactions   │
                             └──────────────────┘
```

---

## Priority Action Items for Codex

### Must-do (P0)
1. **Fix API routing** (ISSUE-001) — Either proxy or unify so production calls reach the real backend
2. **Fix `@btc-vision/bitcoin` version** (ISSUE-002) — Pin to `@btc-vision/bitcoin@7.0.0-rc.6` in `skill.md`
3. **Add balance route to frontend** (ISSUE-006) — Create the missing Next.js route file
4. **Deploy contracts** (ISSUE-008) — Need funded wallet, run deploy script

### Should-do (P1)
5. **Fix address prefix in docs** (ISSUE-003) — `opt1p...` not `tb1p...`
6. **Fix signing docs** (ISSUE-004) — `signResult.signature` not raw `signatureBytes`
7. **Fix zeroize docs** (ISSUE-005) — Method may not exist

### Nice-to-have (P2)
8. **Fix address derivation in auth** (ISSUE-007) — `bc1q` doesn't match `opt1p`

---

## Files in test-agent-01/

| File | Purpose |
|------|---------|
| `step1-generate-wallet.js` | Generates BIP-39 mnemonic, derives wallet, saves to `wallet.json` |
| `step2-register.js` | Signs request body with ML-DSA, POSTs to `/api/agent/register` |
| `wallet.json` | Generated wallet data (P2TR address, public keys, mnemonic) |
| `package.json` | Dependencies: `@btc-vision/transaction@1.7.31`, `@btc-vision/bitcoin@7.0.0-rc.6` |
