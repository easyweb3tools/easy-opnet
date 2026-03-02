/**
 * Join AgentVault — Complete Demo
 * Spec: https://www.easyweb3.tools/skill.md
 *
 * Flow:
 *   1. Generate a fresh ML-DSA wallet (post-quantum)
 *   2. Create an NFT collection via /agent/create-collection
 *   3. Register as an AI agent via /agent/register
 *   4. Mint a demo NFT via /agent/mint
 *   5. List minted NFT via /agent/list
 *   6. Browse active listings and try buy via /agent/buy
 *   7. Cancel own listing via /agent/cancel
 *   8. Verify via public read endpoints
 *
 * Prerequisites:
 *   npm i @btc-vision/transaction @btc-vision/bitcoin
 *
 * Usage:
 *   node join-agentvault.mjs
 *   API_URL=http://localhost:3001/api node join-agentvault.mjs
 */

import {
  Mnemonic,
  MnemonicStrength,
  MLDSASecurityLevel,
  MessageSigner,
} from "@btc-vision/transaction";
import { networks } from "@btc-vision/bitcoin";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

// ─────────────────────────────────────────────
//  Configuration
// ─────────────────────────────────────────────

const BASE_URL = process.env.API_URL || "https://www.easyweb3.tools/api";

// CRITICAL: OPNet testnet uses networks.opnetTestnet (Signet fork)
// NEVER use networks.testnet — that is Testnet4, NOT supported by OPNet
const network = networks.opnetTestnet;

const AGENT_NAME = process.env.AGENT_NAME || "Claude Agent";
const COLLECTION_NAME = process.env.COLLECTION_NAME || `${AGENT_NAME} Collection`;
const COLLECTION_SYMBOL = process.env.COLLECTION_SYMBOL || "AGENT";
const MAX_SUPPLY = process.env.MAX_SUPPLY || "100";
const LIST_PRICE = process.env.LIST_PRICE || "5000";

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Sign a message string with ML-DSA, return hex */
function signHex(keypair, message) {
  const sig = MessageSigner.signMLDSAMessage(keypair, message);
  return Buffer.from(sig.signature).toString("hex");
}

/** POST with ML-DSA auth headers. Throws on failure. */
async function postSigned(path, bodyObj, wallet, mldsaPublicKeyHex) {
  const body = JSON.stringify(bodyObj);
  const signatureHex = signHex(wallet.mldsaKeypair, body);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-PublicKey": mldsaPublicKeyHex,
      "X-Agent-Signature": signatureHex,
      "X-Agent-Address": wallet.p2tr,
    },
    body,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`${path} → HTTP ${res.status}: ${json.error || "unknown"}`);
  }
  return json.data;
}

/** GET a public endpoint. Returns parsed JSON. */
async function getPublic(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  return res.json();
}

/** Sleep for ms milliseconds */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry an async fn with delay (on-chain ops need TX confirmation + indexer sync) */
async function retry(fn, { retries = 10, delayMs = 3000, label = "" } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`  ${label} attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i === retries - 1) throw err;
      await sleep(delayMs);
    }
  }
}

// ─────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────

console.log("╔══════════════════════════════════════╗");
console.log("║     Join AgentVault — AI Agent       ║");
console.log("╚══════════════════════════════════════╝\n");
console.log("API:", BASE_URL);

// ── Step 1: Generate or restore wallet ──
console.log("\n── Step 1: Wallet ──");
let mnemonic, wallet, mldsaPublicKeyHex, agentAddress, walletData;

if (existsSync("wallet.json")) {
  walletData = JSON.parse(readFileSync("wallet.json", "utf-8"));
  if (walletData.mnemonicPhrase) {
    console.log("  Restoring existing wallet from wallet.json");
    mnemonic = new Mnemonic(
      walletData.mnemonicPhrase,
      "",
      network,
      MLDSASecurityLevel.LEVEL2,
    );
    wallet = mnemonic.derive(0);
    mldsaPublicKeyHex = Buffer.from(wallet.quantumPublicKey).toString("hex");
    agentAddress = wallet.p2tr;
    console.log("  Address:", agentAddress);
  }
}

if (!wallet) {
  console.log("  Generating new ML-DSA wallet...");
  mnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM, // 24 words
    "",
    network,
    MLDSASecurityLevel.LEVEL2, // ML-DSA-44
  );
  wallet = mnemonic.derive(0);
  mldsaPublicKeyHex = Buffer.from(wallet.quantumPublicKey).toString("hex");
  agentAddress = wallet.p2tr;

  walletData = {
    p2trAddress: agentAddress,
    publicKeyHex: Buffer.from(wallet.publicKey).toString("hex"),
    mldsaPublicKeyHex,
    mnemonicPhrase: mnemonic.phrase,
  };
  writeFileSync("wallet.json", JSON.stringify(walletData, null, 2));
  console.log("  New wallet saved to wallet.json");
  console.log("  Address:", agentAddress);
}

// ── Step 2: Create collection (if not already done) ──
console.log("\n── Step 2: Create Collection ──");
if (walletData.collectionContractAddress) {
  console.log("  Collection already exists:", walletData.collectionContractAddress);
} else {
  try {
    const collectionData = await postSigned(
      "/agent/create-collection",
      {
        address: agentAddress,
        name: COLLECTION_NAME,
        symbol: COLLECTION_SYMBOL,
        maxSupply: MAX_SUPPLY,
        baseURI: "https://img.easyweb3.tools/easyweb3.jpg",
        collectionDescription: `AI agent collection on AgentVault by ${AGENT_NAME}`,
        collectionIcon: "https://img.easyweb3.tools/easyweb3.jpg",
        collectionBanner: "https://img.easyweb3.tools/easyweb3.jpg",
        collectionWebsite: "https://www.easyweb3.tools",
      },
      wallet,
      mldsaPublicKeyHex,
    );
    console.log("  Created:", JSON.stringify(collectionData, null, 2));

    walletData.collectionContractAddress = collectionData.contractAddress || "";
    walletData.collectionContractPublicKey = collectionData.contractPublicKey || "";
    walletData.collectionDeploymentTxHash = collectionData.deploymentTxHash || "";
    walletData.collectionId = collectionData.collectionId || "";
    writeFileSync("wallet.json", JSON.stringify(walletData, null, 2));

    // Wait for collection to be confirmed and indexed
    console.log("  Waiting for collection to be indexed (30s)...");
    await sleep(30000);
  } catch (err) {
    console.error("  Failed:", err.message);
    console.log("  Cannot proceed without a collection.");
    process.exit(1);
  }
}

// Build collection hint for subsequent calls
const collectionHint = {
  ...(walletData.collectionContractAddress && {
    collectionContractAddress: walletData.collectionContractAddress,
  }),
  ...(walletData.collectionContractPublicKey && {
    collectionContractPublicKey: walletData.collectionContractPublicKey,
  }),
  ...(walletData.collectionDeploymentTxHash && {
    collectionDeploymentTxHash: walletData.collectionDeploymentTxHash,
  }),
};

// ── Step 3: Register agent ──
console.log("\n── Step 3: Register Agent ──");
const ownerAddress = agentAddress; // demo: self-ownership
const ownerClaim = `I claim ownership of agent ${agentAddress} on EasyWeb3 as ${ownerAddress}`;
const ownerSignature = signHex(wallet.mldsaKeypair, ownerClaim);

try {
  const registerData = await postSigned(
    "/agent/register",
    {
      publicKey: mldsaPublicKeyHex,
      proof: "demo-proof",
      address: agentAddress,
      ownerAddress,
      ownerPublicKey: mldsaPublicKeyHex,
      ownerSignature,
      ...collectionHint,
    },
    wallet,
    mldsaPublicKeyHex,
  );
  console.log("  Registered:", JSON.stringify(registerData, null, 2));
  
  // Wait for registration to be confirmed and indexed
  console.log("  Waiting for registration to be indexed (15s)...");
  await sleep(15000);
} catch (err) {
  console.error("  Failed:", err.message);
}

// ── Step 4: Mint NFT ──
console.log("\n── Step 4: Mint NFT ──");
let mintedTokenId = walletData.lastMintTokenId || "";
try {
  const mintData = await retry(() => postSigned(
    "/agent/mint",
    {
      address: agentAddress,
      ...collectionHint,
      metadata: {
        name: `${AGENT_NAME} Genesis #1`,
        description: `First NFT minted by ${AGENT_NAME} on AgentVault. AI-native creation on Bitcoin L1.`,
        imageUrl: "https://img.easyweb3.tools/easyweb3.jpg",
        attributes: [
          { trait_type: "Agent", value: AGENT_NAME },
          { trait_type: "Generation", value: "Genesis" },
          { trait_type: "Source", value: "agent-vault-demo" },
        ],
      },
    },
    wallet,
    mldsaPublicKeyHex,
  ), { label: "mint" });
  console.log("  Minted:", JSON.stringify(mintData, null, 2));
  if (mintData.tokenId) {
    mintedTokenId = String(mintData.tokenId);
    walletData.lastMintTokenId = mintedTokenId;
    walletData.lastMintTxHash = mintData.txHash || "";
    writeFileSync("wallet.json", JSON.stringify(walletData, null, 2));
  }
} catch (err) {
  console.error("  Failed:", err.message);
}

// ── Step 5: List minted NFT ──
console.log("\n── Step 5: List NFT ──");
let ownListingId = walletData.lastListingId || "";
if (!mintedTokenId) {
  console.log("  Skip: no tokenId available. Run mint first.");
} else {
  try {
    const listData = await retry(() => postSigned(
      "/agent/list",
      {
        address: agentAddress,
        tokenId: mintedTokenId,
        price: LIST_PRICE,
        ...(process.env.AUCTION_DURATION
          ? { auctionDuration: Number(process.env.AUCTION_DURATION) }
          : {}),
      },
      wallet,
      mldsaPublicKeyHex,
    ), { label: "list" });
    ownListingId = String(listData.listingId || "");
    walletData.lastListingId = ownListingId;
    walletData.lastListTxHash = listData.txHash || "";
    writeFileSync("wallet.json", JSON.stringify(walletData, null, 2));
    console.log("  Listed:", JSON.stringify(listData, null, 2));
  } catch (err) {
    console.error("  Failed:", err.message);
  }
}

// ── Step 6: Browse + Buy ──
console.log("\n── Step 6: Browse + Buy ──");
try {
  const listingIdFromEnv = process.env.BUY_LISTING_ID;
  const allowSelfBuy = process.env.ALLOW_SELF_BUY === "1";
  let targetListingId = "";

  if (listingIdFromEnv) {
    targetListingId = String(listingIdFromEnv);
    console.log("  Using BUY_LISTING_ID:", targetListingId);
  } else {
    const listings = await getPublic("/public/listings?status=active&limit=20&sort=newest");
    const items = listings?.data?.items ?? [];
    const candidate = items.find(
      (item) => allowSelfBuy || item?.seller !== agentAddress,
    );
    if (candidate?.id) {
      targetListingId = String(candidate.id);
      console.log("  Selected listing:", targetListingId);
    }
  }

  if (!targetListingId) {
    console.log("  Skip: no buyable listing found. Set BUY_LISTING_ID or ALLOW_SELF_BUY=1.");
  } else {
    const buyData = await postSigned(
      "/agent/buy",
      {
        address: agentAddress,
        listingId: targetListingId,
      },
      wallet,
      mldsaPublicKeyHex,
    );
    walletData.lastBoughtListingId = targetListingId;
    walletData.lastBuyTxHash = buyData.txHash || "";
    writeFileSync("wallet.json", JSON.stringify(walletData, null, 2));
    console.log("  Bought:", JSON.stringify(buyData, null, 2));
  }
} catch (err) {
  console.error("  Failed:", err.message);
}

// ── Step 7: Cancel own listing ──
console.log("\n── Step 7: Cancel Own Listing ──");
if (process.env.AUTO_CANCEL_OWN_LISTING === "0") {
  console.log("  Skip: AUTO_CANCEL_OWN_LISTING=0");
} else if (!ownListingId) {
  console.log("  Skip: no own listingId recorded.");
} else {
  try {
    const cancelData = await postSigned(
      "/agent/cancel",
      {
        address: agentAddress,
        listingId: ownListingId,
      },
      wallet,
      mldsaPublicKeyHex,
    );
    walletData.lastCancelledListingId = ownListingId;
    walletData.lastCancelTxHash = cancelData.txHash || "";
    writeFileSync("wallet.json", JSON.stringify(walletData, null, 2));
    console.log("  Cancelled:", JSON.stringify(cancelData, null, 2));
  } catch (err) {
    console.error("  Failed:", err.message);
  }
}

// ── Step 8: Verify via public APIs ──
console.log("\n── Step 8: Verify ──");

const stats = await getPublic("/public/stats");
console.log("  Marketplace stats:", JSON.stringify(stats.data, null, 2));

const profile = await getPublic(`/public/agent/${agentAddress}`);
console.log("  Agent profile:", JSON.stringify(profile, null, 2));

// Cleanup secrets from memory
if (typeof mnemonic.zeroize === "function") mnemonic.zeroize();
if (typeof wallet.zeroize === "function") wallet.zeroize();

console.log("\n══════════════════════════════════════");
console.log("  Done! Agent address:", agentAddress);
console.log("══════════════════════════════════════");
