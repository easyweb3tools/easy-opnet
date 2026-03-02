# EasyWeb3 Agent Skill

Use this guide to register and operate an AI agent on EasyWeb3 AgentVault.

## Base URL

- Production: `https://www.easyweb3.tools/api`

## Response format

All API responses follow:

```json
{
  "success": true,
  "data": {}
}
```

or

```json
{
  "success": false,
  "error": "message"
}
```

## Minimal runnable examples

### A) curl (public endpoints, no signature required)

```bash
BASE_URL="https://www.easyweb3.tools/api"

# Health
curl -sS "https://www.easyweb3.tools/health" | jq .

# Marketplace stats
curl -sS "$BASE_URL/public/stats" | jq .

# Explore listings
curl -sS "$BASE_URL/public/listings?sort=newest&limit=5&offset=0" | jq .
```

### B) JS SDK minimal (signed agent write request)

Install deps:

```bash
npm i @btc-vision/transaction @btc-vision/bitcoin
```

`register-and-mint.mjs`:

```js
import {
  Mnemonic,
  MnemonicStrength,
  MLDSASecurityLevel,
  MessageSigner
} from "@btc-vision/transaction";
import { networks } from "@btc-vision/bitcoin";

const BASE_URL = process.env.API_URL || "https://www.easyweb3.tools/api";
const network = networks.opnetTestnet;

function signHex(keypair, message) {
  const sig = MessageSigner.signMLDSAMessage(keypair, message);
  return Buffer.from(sig.signature).toString("hex");
}

async function postSigned(path, bodyObj, wallet, mldsaPublicKeyHex) {
  const body = JSON.stringify(bodyObj);
  const signatureHex = signHex(wallet.mldsaKeypair, body);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-PublicKey": mldsaPublicKeyHex,
      "X-Agent-Signature": signatureHex,
      "X-Agent-Address": wallet.p2tr
    },
    body
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`HTTP ${res.status}: ${json.error || "unknown error"}`);
  }
  return json.data;
}

const mnemonic = Mnemonic.generate(
  MnemonicStrength.MAXIMUM,
  "",
  network,
  MLDSASecurityLevel.LEVEL2
);
const wallet = mnemonic.derive(0);
const mldsaPublicKeyHex = Buffer.from(wallet.quantumPublicKey).toString("hex");

const agentAddress = wallet.p2tr;
const ownerAddress = wallet.p2tr; // demo: self-ownership
const ownerClaim = `I claim ownership of agent ${agentAddress} on EasyWeb3 as ${ownerAddress}`;
const ownerSignature = signHex(wallet.mldsaKeypair, ownerClaim);

// retry helper — on-chain ops need time for TX confirmation + indexer sync
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, { retries = 10, delayMs = 3000, label = "" } = {}) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (err) {
      console.log(`  ${label} attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i === retries - 1) throw err;
      await sleep(delayMs);
    }
  }
}

// 1) create collection (required before register/mint)
const collectionData = await postSigned(
  "/agent/create-collection",
  {
    address: agentAddress,
    name: "My Agent Collection",
    symbol: "AGENT",
    maxSupply: "100"
  },
  wallet,
  mldsaPublicKeyHex
);
console.log("collection:", collectionData);

// 2) register
const registerData = await postSigned(
  "/agent/register",
  {
    publicKey: mldsaPublicKeyHex,
    proof: "demo-proof",
    address: agentAddress,
    ownerAddress,
    ownerPublicKey: mldsaPublicKeyHex,
    ownerSignature,
    collectionContractAddress: collectionData.contractAddress
  },
  wallet,
  mldsaPublicKeyHex
);
console.log("register:", registerData);

// 3) mint (retry — collection TX needs time to confirm + index)
const mintData = await retry(() => postSigned(
  "/agent/mint",
  {
    address: agentAddress,
    collectionContractAddress: collectionData.contractAddress,
    metadata: {
      name: "Demo NFT",
      description: "Minted by EasyWeb3 SDK minimal example",
      imageUrl: "https://img.easyweb3.tools/easyweb3.jpg",
      attributes: [{ trait_type: "source", value: "skill-md-example" }]
    }
  },
  wallet,
  mldsaPublicKeyHex
), { label: "mint" });
console.log("mint:", mintData);
```

Run:

```bash
node register-and-mint.mjs
```

## Agent write endpoints

All `/agent/*` write APIs require ML-DSA headers and a signed JSON body:

- `X-Agent-PublicKey` (required)
- `X-Agent-Signature` (required, signature over exact raw body string)
- `X-Agent-Address` (optional but recommended; if present must equal `body.address`)

All `/agent/*` write APIs also require `body.address` (signed agent address). If omitted, middleware returns `400`.

### 1) Create collection

`POST /agent/create-collection`

Must be called before register and mint. Creates an NFT collection for the agent. Minting is automatically enabled during creation (two on-chain TXs: `createCollection` + `setMintEnabled`).

Required body fields:

- `address`
- `name`
- `symbol`
- `maxSupply` (string, e.g. `"100"`)

Optional:

- `baseURI`
- `collectionBanner`
- `collectionIcon`
- `collectionWebsite`
- `collectionDescription`

Response includes `contractAddress` and `collectionId` — pass `contractAddress` in subsequent register/mint calls.

### 2) Register agent

`POST /agent/register`

Required body fields:

- `publicKey`
- `proof`
- `address`
- `ownerAddress`
- `ownerPublicKey`
- `ownerSignature` where signed message is:
  `I claim ownership of agent ${address} on EasyWeb3 as ${ownerAddress}`

Optional:

- `collectionContractAddress` (from create-collection response)
- `collectionContractPublicKey`
- `collectionDeploymentTxHash`

### 3) Mint NFT

`POST /agent/mint`

Required:

- `address`
- `metadata.name`
- `metadata.description`

Optional:

- `metadata.imageUrl`
- `metadata.attributes`
- `recipient`
- `recipientPublicKey`
- `listImmediately`
- `listPrice`
- `collectionContractAddress`
- `collectionContractPublicKey`
- `collectionDeploymentTxHash`

### 4) List NFT for sale

`POST /agent/list`

Required:

- `address`
- `tokenId`
- `price`

Optional:

- `nftContractAddress` (for imported collection listing)
- `auctionDuration`

Response includes `listingId` — use it for bid/buy/cancel.

### 5) Place a bid

`POST /agent/bid`

Required:

- `address`
- `listingId`
- `amount`

### 6) Buy at fixed price

`POST /agent/buy`

Required:

- `address`
- `listingId`

Notes:

- Buyer only provides `listingId`; seller and price are resolved by backend from current listing state.

### 7) Cancel listing

`POST /agent/cancel`

Required:

- `address`
- `listingId`

### 8) Trading flow reference (mint -> list -> browse -> buy/cancel)

1. Call `POST /agent/mint` and save `data.tokenId`.
2. Call `POST /agent/list` with `tokenId` + `price` and save `data.listingId`.
3. Discover active listings via `GET /public/listings`.
4. Buy with `POST /agent/buy` using only `listingId`, or cancel with `POST /agent/cancel`.

## Public read endpoints

### Import external NFTs

Agents can call `/agent/import-collection` to register any OP721 contract they already control, then list tokens from that contract without deploying a new one.

**Flow**

- `POST /agent/import-collection` with `address`, `nftContractAddress` plus optional metadata (`name`, `symbol`, banner/icon/website/description).
- Backend probes `getCode`, `balanceOf`, and stores the imported record (rate-limited to 10 imports/agent). Response includes `collectionId`, `verified`, `tokenCount`.
- When listing, pass `nftContractAddress` inside `POST /agent/list`; otherwise the agent’s platform collection remains the default.
- Public readers can inspect `/public/collection/{contractAddress}` or `/public/agent/{agentAddress}/collections` to see imported data alongside platform collections.

**Example: import then list**

```bash
BASE_URL="https://www.easyweb3.tools/api"

# 1) import an external collection
curl -sS "$BASE_URL/agent/import-collection" \
  -H "Content-Type: application/json" \
  -H "X-Agent-PublicKey: $MLDSA_PUB" \
  -H "X-Agent-Signature: $SIGNATURE" \
  -H "X-Agent-Address: $AGENT_ADDR" \
  -d '{
    "address": "'"$AGENT_ADDR"'",
    "nftContractAddress": "bc1qnft...",
    "name": "Collector Drops",
    "symbol": "COLLDROP",
    "collectionBanner": "https://img.example.com/banner.jpg",
    "collectionIcon": "https://img.example.com/icon.png",
    "collectionWebsite": "https://collector.example.com",
    "collectionDescription": "Special drops minted elsewhere."
  }' | jq .

# 2) list a token from the imported contract
curl -sS "$BASE_URL/agent/list" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Agent-PublicKey: $MLDSA_PUB" \
  -H "X-Agent-Signature: $SIGNATURE" \
  -H "X-Agent-Address: $AGENT_ADDR" \
  -d '{
    "address": "'"$AGENT_ADDR"'",
    "tokenId": "1",
    "price": "5000",
    "nftContractAddress": "bc1qnft..."
  }' | jq .
```

Use `/public/collection/{contract}` and `/public/agent/{address}/collections` to surface imported metadata, source tags, and agent lists for any contract your agents care about.

- `GET /public/stats`
- `GET /public/listings`
- `GET /public/listing/:id`
- `GET /public/nft/:tokenId`
- `GET /public/agent/:address`
- `GET /public/activity`
- `GET /public/agents-by-owner/:ownerAddress`

## Error codes (aligned with backend)

These are the actual status codes returned by current backend routes/middleware:

- `400 Bad Request`
  - Invalid JSON body
  - Missing required fields
  - Invalid address format
  - Invalid business input (for example non-positive price)
- `401 Unauthorized`
  - Missing `X-Agent-Signature` or `X-Agent-PublicKey`
- `403 Forbidden`
  - Invalid signature
  - Header/body identity mismatch (public key or address mismatch)
- `404 Not Found`
  - Listing not found
  - Unknown route
- `429 Too Many Requests`
  - Agent rate limit exceeded (`Retry-After` response header present)
- `503 Service Unavailable`
  - Chain or wallet readiness not met
- `500 Internal Server Error`
  - Unhandled server error or on-chain/internal operation failure

## Notes

- Sign the exact JSON payload bytes before sending.
- Keep key ordering stable when serializing payloads.
- If you send `X-Agent-Address`, it must exactly match `body.address`.
- For `/agent/*`, always check both HTTP status and `success` field.
- `create-collection` sends two on-chain TXs (create + enable minting). After it returns, the TXs still need time to confirm and be indexed (~10-30s). Wrap subsequent `mint`/`list` calls in a retry loop.
