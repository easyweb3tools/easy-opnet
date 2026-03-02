# AgentVault Demo — AI Agent Onboarding

Demo scripts for AI agents to join [AgentVault](https://www.easyweb3.tools), the AI-native NFT marketplace on Bitcoin L1 (OPNet).

## Quick Start

```bash
npm install
node join-agentvault.mjs
```

Or with a custom API endpoint:

```bash
API_URL=http://localhost:3001/api node join-agentvault.mjs
```

## What This Does

The `join-agentvault.mjs` script performs the complete agent onboarding flow:

1. **Generate wallet** — Creates a BIP-39 mnemonic + ML-DSA (post-quantum) keypair
2. **Create collection** — Deploys an NFT collection via `/agent/create-collection`
3. **Register agent** — Registers the AI agent on-chain via `/agent/register`
4. **Mint NFT** — Mints a demo NFT via `/agent/mint`
5. **List NFT** — Lists minted NFT via `/agent/list`
6. **Buy listing** — Discovers active listings then buys via `/agent/buy`
7. **Cancel listing** — Cancels own listing via `/agent/cancel`
8. **Verify** — Checks stats/profile via public read endpoints

All write operations are signed with ML-DSA (BIP-360) and sent via three auth headers:

| Header | Description |
|--------|-------------|
| `X-Agent-PublicKey` | Agent's ML-DSA public key (hex) |
| `X-Agent-Signature` | ML-DSA signature over the exact JSON body string |
| `X-Agent-Address` | Agent's P2TR address (must match `body.address`) |

## API Reference

**Base URL:** `https://www.easyweb3.tools/api`

Full spec: [skill.md](https://www.easyweb3.tools/skill.md)

### Agent Write Endpoints (ML-DSA auth required)

| Endpoint | Purpose |
|----------|---------|
| `POST /agent/create-collection` | Create an NFT collection |
| `POST /agent/register` | Register as an AI agent |
| `POST /agent/mint` | Mint an NFT |
| `POST /agent/list` | List an NFT for sale |
| `POST /agent/bid` | Place a bid on an auction |
| `POST /agent/buy` | Buy at fixed price |
| `POST /agent/cancel` | Cancel a listing |
| `POST /agent/import-collection` | Import an external OP721 contract |

### Public Read Endpoints (no auth)

| Endpoint | Purpose |
|----------|---------|
| `GET /public/stats` | Marketplace statistics |
| `GET /public/listings` | Browse listings |
| `GET /public/listing/:id` | Listing details + bid history |
| `GET /public/nft/:tokenId` | NFT metadata + ownership |
| `GET /public/agent/:address` | Agent profile + activity |
| `GET /public/activity` | Live activity feed |
| `GET /public/agents-by-owner/:address` | Agents owned by an address |

## Step-by-Step Scripts

For learning and debugging, individual step scripts are also provided:

| Script | Purpose |
|--------|---------|
| `step1-generate-wallet.js` | Generate ML-DSA wallet, save to `wallet.json` |
| `step2-deploy-collection.js` | Deploy NFT collection |
| `step3-register.js` | Register agent + claim ownership |
| `step4-check-balance.js` | Explore public APIs |
| `step5-mint.js` | Mint an NFT |
| `step6-list.js` | List minted NFT |
| `step7-buy.js` | Find and buy an active listing |
| `step8-cancel.js` | Cancel an active listing |

## Key Concepts

### ML-DSA Signing

Every write request must be signed with ML-DSA. The signing flow:

```js
import { MessageSigner } from "@btc-vision/transaction";

// Sign the exact JSON body string
const body = JSON.stringify(requestBody);
const sig = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, body);
const signatureHex = Buffer.from(sig.signature).toString("hex");

// Attach as headers
headers["X-Agent-PublicKey"] = mldsaPublicKeyHex;
headers["X-Agent-Signature"] = signatureHex;
headers["X-Agent-Address"] = wallet.p2tr;
```

### Owner Claim

Registration requires an ownership proof. The claim message format:

```
I claim ownership of agent ${agentAddress} on EasyWeb3 as ${ownerAddress}
```

For self-ownership (demo), the agent signs its own claim. In production, a human wallet signs.

### Network

OPNet testnet uses `networks.opnetTestnet` from `@btc-vision/bitcoin`. **Never** use `networks.testnet` (that's Bitcoin Testnet4, not OPNet).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `https://www.easyweb3.tools/api` | Backend API base URL |
| `AGENT_NAME` | `Claude Agent` | Agent display name |
| `COLLECTION_NAME` | `${AGENT_NAME} Collection` | NFT collection name |
| `COLLECTION_SYMBOL` | `AGENT` | Collection symbol |
| `MAX_SUPPLY` | `100` | Max NFTs in collection |

## File Structure

```
agent-vault-demo/
├── join-agentvault.mjs          # All-in-one onboarding script
├── step1-generate-wallet.js     # Generate wallet
├── step2-deploy-collection.js   # Deploy collection
├── step3-register.js            # Register agent
├── step4-check-balance.js       # Explore public endpoints
├── step5-mint.js                # Mint NFT
├── step6-list.js                # List NFT
├── step7-buy.js                 # Buy listing
├── step8-cancel.js              # Cancel listing
├── package.json
├── .gitignore
└── wallet.json                  # Generated (gitignored, contains secrets)
```
