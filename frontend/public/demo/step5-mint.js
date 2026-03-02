/**
 * Step 5: Mint an NFT
 * Following: https://www.easyweb3.tools/skill.md
 *
 * Signs the request body with ML-DSA and POSTs to /api/agent/mint.
 * Requires: agent registered (Step 3).
 */

import {
    Mnemonic,
    MLDSASecurityLevel,
    MessageSigner,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.API_URL || 'https://www.easyweb3.tools/api';
const MINT_RETRIES = Number(process.env.MINT_RETRIES || '10');
const MINT_RETRY_DELAY = Number(process.env.MINT_RETRY_DELAY || '3000');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('=== Step 5: Mint an NFT ===\n');
console.log('API Base URL:', BASE_URL);

// Load wallet data
const walletData = JSON.parse(readFileSync('wallet.json', 'utf-8'));
console.log('Agent address:', walletData.p2trAddress);

// Restore wallet
const mnemonic = new Mnemonic(
    walletData.mnemonicPhrase,
    '',
    networks.opnetTestnet,
    MLDSASecurityLevel.LEVEL2,
);
const wallet = mnemonic.derive(0);

// NFT metadata
const NFT_NAME = process.env.NFT_NAME || 'Test Agent 01 - Genesis #1';
const NFT_DESCRIPTION = process.env.NFT_DESCRIPTION || 'First NFT minted by Test Agent 01 on EasyWeb3';
const NFT_IMAGE = process.env.NFT_IMAGE || 'https://img.easyweb3.tools/easyweb3.jpg';

// Build request body
const body = JSON.stringify({
    address: walletData.p2trAddress,
    ...(walletData.collectionContractAddress
        ? { collectionContractAddress: walletData.collectionContractAddress }
        : {}),
    ...(walletData.collectionContractPublicKey
        ? { collectionContractPublicKey: walletData.collectionContractPublicKey }
        : {}),
    ...(walletData.collectionDeploymentTxHash
        ? { collectionDeploymentTxHash: walletData.collectionDeploymentTxHash }
        : {}),
    metadata: {
        name: NFT_NAME,
        description: NFT_DESCRIPTION,
        imageUrl: NFT_IMAGE,
        attributes: [
            { trait_type: 'Agent', value: 'test-agent-01' },
            { trait_type: 'Generation', value: 'Genesis' },
        ],
    },
    listImmediately: false,
});

console.log('\nMinting NFT:', NFT_NAME);

// Sign with ML-DSA
console.log('Signing request body with ML-DSA...');
let signatureHex;
try {
    const signResult = MessageSigner.signMLDSAMessage(
        wallet.mldsaKeypair,
        body,
    );
    signatureHex = Buffer.from(signResult.signature).toString('hex');
    console.log('Signature length:', signatureHex.length, 'hex chars');
} catch (err) {
    console.error('SIGNING FAILED:', err.message);
    process.exit(1);
}

// POST to /api/agent/mint (with retry for TX confirmation + indexer sync)
console.log('\nPOSTing to', `${BASE_URL}/agent/mint ...`);
let lastErr;
for (let attempt = 1; attempt <= MINT_RETRIES; attempt++) {
    try {
        const response = await fetch(`${BASE_URL}/agent/mint`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Agent-PublicKey': walletData.mldsaPublicKeyHex,
                'X-Agent-Signature': signatureHex,
                'X-Agent-Address': walletData.p2trAddress,
            },
            body: body,
        });

        const status = response.status;
        const text = await response.text();
        console.log('HTTP status:', status);

        try {
            const json = JSON.parse(text);

            if (json.success && json.data) {
                console.log('Response:', JSON.stringify(json, null, 2));
                console.log('\n=== NFT Minted Successfully ===');
                console.log('Token ID:', json.data.tokenId || 'N/A');
                console.log('TX hash:', json.data.txHash || 'N/A');
                walletData.lastMintTokenId = json.data.tokenId ? String(json.data.tokenId) : '';
                walletData.lastMintTxHash = json.data.txHash || '';
                writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
                console.log('Updated wallet.json with lastMintTokenId');
                lastErr = null;
                break;
            }

            // Server returned an error — retry if transient
            lastErr = new Error(json.error || `HTTP ${status}`);
            console.log(`  Attempt ${attempt}/${MINT_RETRIES} failed: ${lastErr.message}`);
        } catch {
            lastErr = new Error(`Non-JSON response: ${text.substring(0, 200)}`);
            console.log(`  Attempt ${attempt}/${MINT_RETRIES} failed: ${lastErr.message}`);
        }
    } catch (err) {
        lastErr = err;
        console.log(`  Attempt ${attempt}/${MINT_RETRIES} fetch failed: ${err.message}`);
    }

    if (attempt < MINT_RETRIES) {
        console.log(`  Waiting ${MINT_RETRY_DELAY}ms before retry...`);
        await sleep(MINT_RETRY_DELAY);
    }
}

if (lastErr) {
    console.error('MINT FAILED after all retries:', lastErr.message);
}

// Cleanup
if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
if (typeof wallet.zeroize === 'function') wallet.zeroize();

console.log('\n=== Step 5 Complete ===');
