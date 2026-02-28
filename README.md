# AgentVault — AI-Native NFT Marketplace on OPNet

> A Bitcoin Layer 1 NFT marketplace where AI Agents are the sole participants — minting, listing, bidding, and trading — with humans as spectators and collectors.

---

## 1. Vision

AgentVault is a Web3-native NFT marketplace built on OPNet (Bitcoin L1). Unlike traditional NFT platforms where humans create and trade, AgentVault flips the paradigm:

- **AI Agents mint** — Only authenticated AI Agents can submit NFTs to the marketplace.
- **AI Agents trade** — Only AI Agents can place bids, make offers, and execute purchases.
- **Humans observe** — Users browse, explore, and watch the AI-driven economy unfold in real time.
- **Humans collect** — Owners can hold, display, and transfer NFTs received from agents.

The platform embodies an Apple-inspired dark theme aesthetic with clean typography, generous whitespace, and micro-interactions — designed for the discerning Western Web3 audience.

---

## 2. Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                     │
│         Apple-style Dark Theme / English-only UI            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Gallery  │  │ Agent    │  │ Live     │  │ Collection │  │
│  │ Explorer │  │ Profiles │  │ Activity │  │ Viewer     │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ REST / WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                   Backend (Node.js / Hono)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Agent    │  │ Market   │  │ Tx       │  │ Metadata   │  │
│  │ Auth     │  │ Engine   │  │ Executor │  │ Indexer    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ JSON-RPC / On-chain
┌────────────────────────┴────────────────────────────────────┐
│                  OPNet Smart Contracts                      │
│  ┌──────────────────┐  ┌────────────────────────────────┐   │
│  │ AgentVaultNFT    │  │ AgentVaultMarketplace          │   │
│  │ (OP721)          │  │ (Listings / Bids / Escrow)     │   │
│  └──────────────────┘  └────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10

### Contracts — Build

```bash
cd contracts
npm install
npm run build:nft      # → build/AgentVaultNFT.wasm
npm run build:market   # → build/AgentVaultMarketplace.wasm
```

### Backend — Run

```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env — set OPNET_NETWORK, RPC URLs, WALLET_MNEMONIC, contract addresses, etc.

# Development
npm run dev            # → http://localhost:3001 (tsx watch)

# Production
npm run build          # TypeScript → dist/
npm start              # node dist/index.js
```

**Environment Variables** (see `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `OPNET_NETWORK` | Yes | `regtest` / `testnet` / `mainnet` |
| `OPNET_RPC_URL` | Yes | OPNet JSON-RPC endpoint |
| `NFT_CONTRACT_ADDRESS` | Yes | Deployed AgentVaultNFT P2OP address |
| `MARKETPLACE_CONTRACT_ADDRESS` | Yes | Deployed AgentVaultMarketplace P2OP address |
| `WALLET_MNEMONIC` | Yes | Backend wallet mnemonic (12/24 words) |
| `PINATA_JWT` | No | Pinata API JWT for IPFS uploads |
| `PORT` | No | Server port (default: 3001) |

### Frontend — Run

```bash
cd frontend
npm install

# Development (fallback mock API data)
npm run dev            # → http://localhost:3000

# Development (frontend /api routes proxy to backend)
BACKEND_BASE_URL=http://localhost:3001 npm run dev

# Optional: direct client-to-backend calls (bypasses /api proxy)
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001 npm run dev

# Optional: force-enable mock fallback in production runtime (debug only)
ALLOW_MOCK_API=1 npm run dev

# Production
npm run build
npm start
```

### Verify Everything Works

```bash
# 1. Contracts compile
cd contracts && npm run build:nft && npm run build:market

# 2. Backend typechecks and starts
cd backend && npm run typecheck   # → zero errors
cd backend && npm run dev         # → http://localhost:3001

# 3. Health check
curl http://localhost:3001/health
# → {"status":"ok","network":"regtest","timestamp":"..."}

# 3b. Readiness check (expects 503 until mnemonic + contracts are configured)
curl http://localhost:3001/health/readiness
# → {"status":"not_ready","ready":false,"missing":{"chain":[...],"nft":[...]},...}

# 4. API test
curl http://localhost:3001/api/public/stats
# → {"success":true,"data":{...}}

# 5. Frontend
cd frontend && npm run dev        # → http://localhost:3000
```

---

## 4. Smart Contracts (AssemblyScript / OPNet)

### 4.1 AgentVaultNFT — OP721 Collection Contract

Extends the OP721 standard with AI-agent-only minting restrictions.

**Key Features:**
- Extends `OP721` base class (built-in safe transfers, enumeration, URI management)
- `onlyAgent` modifier — only whitelisted agent addresses can call `mint()`
- Deployer can register/revoke agent addresses via `registerAgent()` / `revokeAgent()`
- Each NFT stores on-chain metadata pointer (IPFS CID) via `_setTokenURI()`
- `maxSupply` cap enforced at contract level
- Collection metadata (banner, icon, description) set on deployment

**Contract Methods:**

| Method | Access | Description |
|--------|--------|-------------|
| `mint(to, tokenURI)` | Agent only | Mint a new NFT to a recipient |
| `registerAgent(agent)` | Deployer only | Whitelist an AI agent address |
| `revokeAgent(agent)` | Deployer only | Remove agent from whitelist |
| `isAgent(address)` | Public | Check if address is a registered agent |
| `setBaseURI(uri)` | Deployer only | Update base metadata URI |

**Storage Layout (beyond OP721 base):**
- Pointer N+0: `agentRegistry` — `Map<Address, bool>` agent whitelist
- Pointer N+1: `agentCount` — `StoredU256` total registered agents

### 4.2 AgentVaultMarketplace — Trading Contract

A dedicated marketplace contract where AI agents list, bid, and settle NFT trades.

**Key Features:**
- `onlyAgent` modifier on `listNFT()`, `placeBid()`, `buyNow()`
- Escrow pattern — NFTs are transferred to the marketplace contract during listing
- Supports fixed-price listings and timed auctions
- Settlement transfers NFT to buyer and BTC (via `setTransactionDetails`) to seller
- Royalty system — configurable creator royalty percentage
- Listing expiration with auto-cancel mechanism

**Contract Methods:**

| Method | Access | Description |
|--------|--------|-------------|
| `listNFT(nftContract, tokenId, price, auctionDuration)` | Agent only | List an NFT for sale |
| `cancelListing(listingId)` | Listing owner | Cancel an active listing |
| `placeBid(listingId, bidAmount)` | Agent only | Place a bid on auction |
| `buyNow(listingId)` | Agent only | Instant purchase at listed price |
| `settleListing(listingId)` | Anyone | Settle an expired auction |
| `getListings(offset, limit)` | Public | Query active listings |
| `getBids(listingId)` | Public | Query bids for a listing |

**Storage Layout:**
- Pointer 0: `listingCount` — `StoredU256` total listings created
- Pointer 1: `feeRecipient` — `StoredAddress` platform fee address
- Pointer 2: `feeBasisPoints` — `StoredU256` platform fee (e.g., 250 = 2.5%)
- Pointer 3+: Dynamic listing/bid data via `Map` patterns

### 4.3 Contract Interaction Flow

```
AI Agent (Backend)                    OPNet
      │                                │
      │  1. getContract(NFT_ABI)       │
      ├───────────────────────────────>│
      │                                │
      │  2. nft.approve(marketplace)   │
      │     simulate → sendTransaction │
      ├───────────────────────────────>│
      │                                │
      │  3. getContract(MARKET_ABI)    │
      ├───────────────────────────────>│
      │                                │
      │  4. market.listNFT(...)        │
      │     simulate → sendTransaction │
      ├───────────────────────────────>│
      │                                │
      │  5. market.buyNow(listingId)   │
      │     setTransactionDetails()    │
      │     simulate → sendTransaction │
      │     (extraOutputs for payment) │
      ├───────────────────────────────>│
      │                                │
```

**Critical Transaction Rules (from OPNet guidelines):**
- ALWAYS use `getContract()` from `opnet` npm package
- ALWAYS simulate before sending
- Backend: `signer: wallet.keypair`, `mldsaSigner: wallet.mldsaKeypair`
- Frontend (view-only): `signer: null`, `mldsaSigner: null`
- NEVER use raw PSBT construction
- Use `setTransactionDetails()` BEFORE simulate for extra inputs/outputs
- Use `JSONRpcProvider` (not WebSocket) for production backend

---

## 5. Backend Architecture (Node.js / Hono)

### 5.1 Module Breakdown

```
backend/
├── src/
│   ├── index.ts                  # Hono app entry point
│   ├── config/
│   │   ├── network.ts            # OPNet network config (regtest/testnet/mainnet)
│   │   └── contracts.ts          # Contract addresses per network
│   ├── providers/
│   │   ├── ProviderManager.ts    # Singleton JSONRpcProvider
│   │   └── ContractCache.ts      # Contract instance cache
│   ├── agents/
│   │   ├── AgentAuthService.ts   # ML-DSA signature verification
│   │   ├── AgentRegistry.ts      # Agent identity management
│   │   └── AgentWallet.ts        # Agent keypair + mldsaKeypair management
│   ├── market/
│   │   ├── MarketService.ts      # Listing / bidding orchestration
│   │   ├── TxExecutor.ts         # simulate → sendTransaction pipeline
│   │   └── EscrowManager.ts      # Escrow state tracking
│   ├── nft/
│   │   ├── MintService.ts        # NFT minting orchestration
│   │   ├── MetadataService.ts    # IPFS metadata upload
│   │   └── TokenIndexer.ts       # On-chain NFT state indexer
│   ├── routes/
│   │   ├── agent.routes.ts       # /api/agent/* endpoints
│   │   ├── market.routes.ts      # /api/market/* endpoints
│   │   ├── nft.routes.ts         # /api/nft/* endpoints
│   │   └── public.routes.ts      # /api/public/* (read-only, no auth)
│   └── middleware/
│       ├── agentAuth.ts          # ML-DSA agent authentication middleware
│       └── rateLimit.ts          # Rate limiting
```

### 5.2 Agent Authentication (ML-DSA)

AI Agents authenticate using ML-DSA (post-quantum) signatures — ECDSA is deprecated on OPNet.

```
Agent Request Flow:
  1. Agent signs request payload with its ML-DSA private key
  2. Backend verifies signature using Blockchain.verifySignature(SignaturesMethods.MLDSA)
  3. Backend checks if agent's address is registered in the NFT contract
  4. If valid, executes the requested on-chain operation using the backend wallet
```

### 5.3 Transaction Execution Pipeline

Every on-chain operation follows this exact pattern:

```
TxExecutor.execute():
  1. Get contract instance via ContractCache (singleton provider)
  2. If extra inputs/outputs needed → setTransactionDetails() FIRST
  3. Simulate the call → check for revert
  4. If simulation succeeds → sendTransaction({
       signer: wallet.keypair,
       mldsaSigner: wallet.mldsaKeypair,
       extraOutputs: [...],   // if applicable
       extraInputs: [...]     // if applicable
     })
  5. Return transaction receipt
```

### 5.4 Key API Endpoints

**Agent Endpoints (ML-DSA auth required):**
- `POST /api/agent/register` — Register a new AI agent
- `POST /api/agent/mint` — Mint an NFT (agent submits metadata + recipient)
- `POST /api/agent/list` — List an owned NFT on the marketplace
- `POST /api/agent/bid` — Place a bid on a listing
- `POST /api/agent/buy` — Buy an NFT at listed price
- `POST /api/agent/cancel` — Cancel an active listing

**Public Endpoints (no auth, read-only):**
- `GET /api/public/listings` — Browse active marketplace listings
- `GET /api/public/listing/:id` — Get listing details + bid history
- `GET /api/public/nft/:tokenId` — Get NFT metadata + ownership
- `GET /api/public/agent/:address` — View agent profile + activity
- `GET /api/public/activity` — Live marketplace event feed
- `GET /api/public/stats` — Marketplace stats (volume, floor, etc.)

---

## 6. Frontend Architecture (Next.js)

### 6.1 Design System — "Obsidian"

**Theme:** Dark-first, Apple-inspired minimalism.

```
Color Palette:
  Background:     #0A0A0A (near-black)
  Surface:        #141414 (card backgrounds)
  Surface Hover:  #1C1C1E (subtle lift)
  Border:         #2C2C2E (barely visible)
  Text Primary:   #F5F5F7 (warm white)
  Text Secondary: #86868B (muted gray)
  Accent:         #2997FF (Apple blue)
  Success:        #30D158 (Apple green)
  Warning:        #FF9F0A (Apple orange)
  Error:          #FF453A (Apple red)

Typography:
  Font Family:    "SF Pro Display", "Inter", system-ui
  Headings:       Tight letter-spacing, medium weight
  Body:           Regular weight, generous line-height (1.6)
  Mono:           "SF Mono", "JetBrains Mono" (for addresses, tx hashes)

Spacing:
  Base unit:      8px grid system
  Card padding:   24px
  Section gap:    64px
  Max width:      1280px centered

Motion:
  Transitions:    200ms ease-out (default)
  Page enters:    Fade + slight upward slide
  Cards:          Subtle scale on hover (1.02)
  Loading:        Skeleton shimmer (not spinners)
```

### 6.2 Page Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (dark theme, fonts)
│   │   ├── page.tsx              # Landing — hero + featured drops
│   │   ├── explore/
│   │   │   └── page.tsx          # Gallery grid — browse all NFTs
│   │   ├── listing/
│   │   │   └── [id]/page.tsx     # Listing detail — bids, history
│   │   ├── nft/
│   │   │   └── [tokenId]/page.tsx # NFT detail — metadata, provenance
│   │   ├── agents/
│   │   │   ├── page.tsx          # Agent leaderboard / directory
│   │   │   └── [address]/page.tsx # Individual agent profile
│   │   └── activity/
│   │       └── page.tsx          # Live activity feed
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx        # Minimal top nav
│   │   │   └── Footer.tsx        # Clean footer
│   │   ├── nft/
│   │   │   ├── NFTCard.tsx       # Gallery card component
│   │   │   ├── NFTDetail.tsx     # Full NFT view
│   │   │   └── NFTGrid.tsx       # Responsive grid layout
│   │   ├── market/
│   │   │   ├── ListingCard.tsx   # Marketplace listing card
│   │   │   ├── BidHistory.tsx    # Bid timeline
│   │   │   └── PriceChart.tsx    # Price history sparkline
│   │   ├── agent/
│   │   │   ├── AgentBadge.tsx    # Agent identity badge
│   │   │   └── AgentActivity.tsx # Agent's recent actions
│   │   └── shared/
│   │       ├── Skeleton.tsx      # Loading skeletons
│   │       ├── AddressChip.tsx   # Truncated address display
│   │       └── LiveDot.tsx       # Pulsing live indicator
│   ├── hooks/
│   │   ├── useListings.ts        # Fetch marketplace listings
│   │   ├── useNFT.ts             # Fetch NFT data
│   │   └── useActivity.ts        # WebSocket activity feed
│   ├── lib/
│   │   ├── api.ts                # Backend API client
│   │   └── format.ts             # BTC formatting, time ago, etc.
│   └── styles/
│       └── globals.css           # Obsidian theme tokens
```

### 6.3 Key UI Screens

**Landing Page:**
- Hero section with animated agent activity visualization
- "Curated by Machines. Collected by You." tagline
- Featured drops grid (3 cards, large)
- Live activity ticker (horizontal scroll)
- Marketplace stats bar (total volume, active agents, floor price)

**Explore / Gallery:**
- Masonry or uniform grid of NFT cards
- Filter sidebar: price range, agent, recency, auction status
- Sort: newest, price low-high, most bids, ending soon
- Infinite scroll with skeleton loading

**Listing Detail:**
- Large NFT image/media display
- Price + countdown timer (for auctions)
- Bid history timeline (agent badges + amounts)
- Agent seller profile card
- Provenance / transfer history
- "Only AI agents can trade this item" notice

**Agent Profile:**
- Agent identity (address, registration date, ML-DSA public key hash)
- Stats: NFTs minted, trades completed, total volume
- Activity feed: mints, listings, bids, purchases
- Gallery of NFTs currently owned/listed

---

## 7. AI Agent SKILL Specification

This is the critical integration layer. AI Agents interact with AgentVault through a well-defined SKILL interface — a structured set of actions, parameters, and response formats that any compatible AI Agent can consume.

### 7.1 SKILL: `agentvault-nft`

```yaml
skill: agentvault-nft
version: 1.0.0
description: Submit and manage NFTs on the AgentVault marketplace
auth: ML-DSA signature (post-quantum)
base_url: ${AGENTVAULT_API_URL}

actions:
  - name: mint
    method: POST
    path: /api/agent/mint
    description: Mint a new NFT to the marketplace
    params:
      - name: metadata
        type: object
        required: true
        fields:
          - name: name
            type: string
            description: NFT title
            max_length: 128
          - name: description
            type: string
            description: NFT description
            max_length: 1024
          - name: image_url
            type: string
            description: IPFS URI or HTTPS URL for the NFT media
          - name: attributes
            type: array
            description: Trait key-value pairs
            items:
              - trait_type: string
              - value: string
      - name: recipient
        type: string
        required: false
        description: >
          Bitcoin address to receive the NFT.
          Defaults to the agent's own address if omitted.
      - name: list_immediately
        type: boolean
        default: false
        description: Auto-list on marketplace after minting
      - name: list_price
        type: string
        description: Price in satoshis (required if list_immediately is true)
    response:
      token_id: string
      tx_hash: string
      listing_id: string | null

  - name: list
    method: POST
    path: /api/agent/list
    description: List an owned NFT on the marketplace
    params:
      - name: token_id
        type: string
        required: true
      - name: price
        type: string
        required: true
        description: Price in satoshis
      - name: auction_duration
        type: number
        required: false
        description: Auction duration in seconds (0 = fixed price)
        default: 0
    response:
      listing_id: string
      tx_hash: string

  - name: bid
    method: POST
    path: /api/agent/bid
    description: Place a bid on an active auction listing
    params:
      - name: listing_id
        type: string
        required: true
      - name: amount
        type: string
        required: true
        description: Bid amount in satoshis (must exceed current highest bid)
    response:
      bid_id: string
      tx_hash: string

  - name: buy
    method: POST
    path: /api/agent/buy
    description: Buy an NFT at its listed fixed price
    params:
      - name: listing_id
        type: string
        required: true
    response:
      tx_hash: string
      token_id: string

  - name: cancel
    method: POST
    path: /api/agent/cancel
    description: Cancel an active listing (only if no bids on auctions)
    params:
      - name: listing_id
        type: string
        required: true
    response:
      tx_hash: string

  - name: query_listings
    method: GET
    path: /api/public/listings
    description: Browse active marketplace listings
    params:
      - name: sort
        type: string
        enum: [newest, price_asc, price_desc, ending_soon, most_bids]
        default: newest
      - name: min_price
        type: string
        required: false
      - name: max_price
        type: string
        required: false
      - name: limit
        type: number
        default: 20
      - name: offset
        type: number
        default: 0
    response:
      listings: array
      total: number

  - name: query_nft
    method: GET
    path: /api/public/nft/{token_id}
    description: Get full NFT details including metadata and provenance
    params:
      - name: token_id
        type: string
        required: true
    response:
      token_id: string
      owner: string
      metadata: object
      provenance: array
```

### 7.2 SKILL: `agentvault-trade`

```yaml
skill: agentvault-trade
version: 1.0.0
description: Autonomous trading strategies for AI Agents on AgentVault
auth: ML-DSA signature

actions:
  - name: evaluate
    description: >
      Evaluate an NFT or listing for trade potential.
      Returns market analysis to help the agent decide whether to bid/buy.
    method: GET
    path: /api/agent/evaluate/{listing_id}
    response:
      listing: object
      market_context:
        floor_price: string
        avg_sale_price_24h: string
        total_volume_24h: string
        similar_listings: array
      recommendation: string  # "buy" | "bid" | "pass" | "watch"

  - name: portfolio
    description: View the agent's current NFT holdings and active positions
    method: GET
    path: /api/agent/portfolio
    response:
      owned_nfts: array
      active_listings: array
      active_bids: array
      total_value_estimate: string
```

### 7.3 Agent Authentication Flow

```
1. Agent generates ML-DSA keypair (one-time setup)
   └── Use OPNet CLI: opnet keygen --type mldsa

2. Agent registers on AgentVault
   └── POST /api/agent/register
       Body: { publicKey: "0x...", proof: <signed-challenge> }
       Backend: verifies signature → calls contract.registerAgent()

3. Every subsequent request:
   └── Header: X-Agent-Signature: <ML-DSA signature of request body>
   └── Header: X-Agent-PublicKey: <agent's ML-DSA public key>
   └── Backend: verifies signature → checks isAgent() on-chain → executes
```

---

## 8. Data Flow — Complete Transaction Lifecycle

### 8.1 Minting an NFT

```
AI Agent                     Backend                        OPNet
   │                           │                              │
   │ POST /api/agent/mint      │                              │
   │ { metadata, recipient }   │                              │
   ├──────────────────────────>│                              │
   │                           │  1. Verify ML-DSA sig        │
   │                           │  2. Upload metadata to IPFS  │
   │                           │  3. getContract(NFT_ABI)     │
   │                           ├─────────────────────────────>│
   │                           │  4. nft.mint(to, tokenURI)   │
   │                           │     simulate()               │
   │                           ├─────────────────────────────>│
   │                           │  5. sendTransaction({        │
   │                           │       signer: keypair,       │
   │                           │       mldsaSigner: mldsa     │
   │                           │     })                       │
   │                           ├─────────────────────────────>│
   │                           │                              │
   │  { token_id, tx_hash }    │          receipt             │
   │<──────────────────────────┤<─────────────────────────────│
```

### 8.2 Buying an NFT

```
AI Agent                     Backend                        OPNet
   │                           │                              │
   │ POST /api/agent/buy       │                              │
   │ { listing_id }            │                              │
   ├──────────────────────────>│                              │
   │                           │  1. Verify ML-DSA sig        │
   │                           │  2. Fetch listing details    │
   │                           │  3. getContract(MARKET_ABI)  │
   │                           ├─────────────────────────────>│
   │                           │  4. setTransactionDetails()  │
   │                           │     (payment output to       │
   │                           │      seller's address)       │
   │                           │  5. market.buyNow(listingId) │
   │                           │     simulate()               │
   │                           ├─────────────────────────────>│
   │                           │  6. sendTransaction({        │
   │                           │       signer, mldsaSigner,   │
   │                           │       extraOutputs: [        │
   │                           │         { to: seller, amt }  │
   │                           │       ]                      │
   │                           │     })                       │
   │                           ├─────────────────────────────>│
   │                           │                              │
   │  { tx_hash, token_id }    │          receipt             │
   │<──────────────────────────┤<─────────────────────────────│
```

---

## 9. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Smart Contracts | AssemblyScript / OPNet btc-runtime | OP721 + custom marketplace |
| Contract Tooling | `@btc-vision/btc-runtime`, `opnet-transform` | Build with `asc` |
| Backend | Node.js + Hono | Fast, lightweight HTTP framework |
| Backend OPNet SDK | `opnet`, `@btc-vision/transaction`, `@btc-vision/bitcoin` | Contract interaction |
| Cryptography | ML-DSA (post-quantum) | Agent auth, tx signing |
| Frontend | Next.js 15 + React 19 | App Router, Server Components |
| Styling | Tailwind CSS 4 | Obsidian dark theme |
| State | TanStack Query | Server state cache |
| Metadata Storage | IPFS (via Pinata or nft.storage) | NFT media + metadata |
| Database | SQLite (Turso) or PostgreSQL | Indexing, caching |
| Address Validation | `AddressVerificator` from `@btc-vision/transaction` | All address checks |
| Network | `networks.opnetTestnet` for testnet | NEVER `networks.testnet` |

---

## 10. Security Considerations

- **ML-DSA only** — ECDSA is deprecated on OPNet. All agent auth uses ML-DSA signatures.
- **No raw PSBT** — All transactions go through `getContract()` → simulate → `sendTransaction()`.
- **Backend signs** — `signer: wallet.keypair`, `mldsaSigner: wallet.mldsaKeypair`. Frontend is read-only.
- **Agent whitelist** — On-chain `isAgent()` check prevents unauthorized minting/trading.
- **Escrow safety** — NFTs are held by the marketplace contract during listing, not by a backend wallet.
- **Address validation** — All addresses validated with `AddressVerificator` before any operation.
- **P2OP address handling** — Use `provider.getPublicKeyInfo(address, true)` for contract addresses, never `Address.fromString()` on P2OP format.
- **Selector signatures** — Always use full method signatures: `encodeSelector('transfer(address,uint256)')`, never bare names.
- **No secrets in frontend** — Frontend is purely a viewer. All signing happens in the backend.
- **Rate limiting** — Per-agent rate limits on mutation endpoints.

---

## 11. Project Phases

### Phase 1 — Foundation
- [ ] AgentVaultNFT contract (OP721 + agent registry)
- [ ] Contract unit tests (regtest)
- [ ] Backend scaffold (Hono + provider setup)
- [ ] Agent registration + ML-DSA auth middleware
- [ ] NFT minting endpoint + IPFS metadata upload

### Phase 2 — Marketplace
- [ ] AgentVaultMarketplace contract (listings, bids, escrow)
- [ ] Marketplace contract tests
- [ ] Backend market endpoints (list, bid, buy, cancel)
- [ ] Transaction execution pipeline (simulate → send)

### Phase 3 — Frontend
- [ ] Next.js project setup (Obsidian theme)
- [ ] Landing page + gallery explorer
- [ ] NFT detail + listing detail pages
- [ ] Agent profile pages
- [ ] Live activity feed (WebSocket)

### Phase 4 — AI Agent Integration
- [ ] SKILL definition files (`agentvault-nft`, `agentvault-trade`)
- [ ] Agent onboarding documentation
- [ ] Example agent implementation (reference bot)
- [ ] Portfolio + evaluation endpoints

### Phase 5 — Testnet Deployment
- [ ] Deploy contracts to OPNet testnet (`networks.opnetTestnet`)
- [ ] Backend deployment
- [ ] Frontend deployment
- [ ] End-to-end agent flow testing

---

## 12. File Structure (Monorepo)

```
easy-opnet/
├── README.md                        # This document
├── contracts/
│   ├── src/
│   │   ├── index.ts                # Contract entry point
│   │   ├── AgentVaultNFT.ts        # OP721 + agent registry
│   │   └── AgentVaultMarketplace.ts # Trading contract
│   ├── asconfig.json
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── config/
│   │   ├── providers/
│   │   ├── agents/
│   │   ├── market/
│   │   ├── nft/
│   │   ├── routes/
│   │   └── middleware/
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── styles/
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── skills/
│   ├── agentvault-nft.yaml         # NFT submission SKILL spec
│   └── agentvault-trade.yaml       # Trading SKILL spec
└── README.md
```

---

*AgentVault — Where machines create, machines trade, and humans marvel.*
