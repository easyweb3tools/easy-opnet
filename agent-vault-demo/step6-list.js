/**
 * Step 6: List NFT on Marketplace
 * Following: https://www.easyweb3.tools/skill.md
 *
 * Signs the request body with ML-DSA and POSTs to /api/agent/list.
 * Requires: NFT already minted (Step 5) and tokenId saved in wallet.json.
 */

import {
    Mnemonic,
    MLDSASecurityLevel,
    MessageSigner,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.API_URL || 'https://www.easyweb3.tools/api';
const LIST_RETRIES = Number(process.env.LIST_RETRIES || '10');
const LIST_RETRY_DELAY = Number(process.env.LIST_RETRY_DELAY || '3000');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('=== Step 6: List NFT ===\n');
console.log('API Base URL:', BASE_URL);

const walletData = JSON.parse(readFileSync('wallet.json', 'utf-8'));
console.log('Agent address:', walletData.p2trAddress);

const tokenId = process.env.TOKEN_ID || walletData.lastMintTokenId;
if (!tokenId) {
    console.error('Missing tokenId. Run step5 first or set TOKEN_ID.');
    process.exit(1);
}

const listingPrice = process.env.LIST_PRICE || '5000';
const auctionDuration = process.env.AUCTION_DURATION
    ? Number(process.env.AUCTION_DURATION)
    : 0;

const mnemonic = new Mnemonic(
    walletData.mnemonicPhrase,
    '',
    networks.opnetTestnet,
    MLDSASecurityLevel.LEVEL2,
);
const wallet = mnemonic.derive(0);

const body = JSON.stringify({
    address: walletData.p2trAddress,
    tokenId: String(tokenId),
    price: String(listingPrice),
    ...(auctionDuration > 0 ? { auctionDuration } : {}),
    ...(process.env.NFT_CONTRACT_ADDRESS
        ? { nftContractAddress: process.env.NFT_CONTRACT_ADDRESS }
        : {}),
});

console.log(`\nListing token #${tokenId} at ${listingPrice} sats...`);

let signatureHex;
try {
    const signResult = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, body);
    signatureHex = Buffer.from(signResult.signature).toString('hex');
} catch (err) {
    console.error('SIGNING FAILED:', err.message);
    process.exit(1);
}

console.log('\nPOSTing to', `${BASE_URL}/agent/list ...`);
let lastErr;
for (let attempt = 1; attempt <= LIST_RETRIES; attempt++) {
    try {
        const response = await fetch(`${BASE_URL}/agent/list`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Agent-PublicKey': walletData.mldsaPublicKeyHex,
                'X-Agent-Signature': signatureHex,
                'X-Agent-Address': walletData.p2trAddress,
            },
            body,
        });

        const status = response.status;
        const text = await response.text();
        console.log('HTTP status:', status);

        try {
            const json = JSON.parse(text);

            if (json.success && json.data) {
                console.log('Response:', JSON.stringify(json, null, 2));
                console.log('\n=== NFT Listed Successfully ===');
                console.log('Listing ID:', json.data.listingId || 'N/A');
                console.log('TX hash:', json.data.txHash || 'N/A');
                walletData.lastListingId = json.data.listingId ? String(json.data.listingId) : '';
                walletData.lastListTxHash = json.data.txHash || '';
                writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
                console.log('Updated wallet.json with lastListingId');
                lastErr = null;
                break;
            }

            lastErr = new Error(json.error || `HTTP ${status}`);
            console.log(`  Attempt ${attempt}/${LIST_RETRIES} failed: ${lastErr.message}`);
        } catch {
            lastErr = new Error(`Non-JSON response: ${text.substring(0, 200)}`);
            console.log(`  Attempt ${attempt}/${LIST_RETRIES} failed: ${lastErr.message}`);
        }
    } catch (err) {
        lastErr = err;
        console.log(`  Attempt ${attempt}/${LIST_RETRIES} fetch failed: ${err.message}`);
    }

    if (attempt < LIST_RETRIES) {
        console.log(`  Waiting ${LIST_RETRY_DELAY}ms before retry...`);
        await sleep(LIST_RETRY_DELAY);
    }
}

if (lastErr) {
    console.error('LIST FAILED after all retries:', lastErr.message);
}

if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
if (typeof wallet.zeroize === 'function') wallet.zeroize();

console.log('\n=== Step 6 Complete ===');
