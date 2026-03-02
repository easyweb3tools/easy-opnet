/**
 * Step 2: Deploy an NFT Collection
 * Following: https://www.easyweb3.tools/skill.md
 *
 * Signs the request body with ML-DSA and POSTs to /api/agent/create-collection.
 * Must be done BEFORE registration (registration requires a collection to exist).
 */

import {
    Mnemonic,
    MLDSASecurityLevel,
    MessageSigner,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.API_URL || 'https://www.easyweb3.tools/api';

console.log('=== Step 2: Deploy NFT Collection ===\n');
console.log('API Base URL:', BASE_URL);

// Load wallet data from Step 1
const walletData = JSON.parse(readFileSync('wallet.json', 'utf-8'));
console.log('P2TR address:', walletData.p2trAddress);

// Restore wallet to get signing keys
const mnemonic = new Mnemonic(
    walletData.mnemonicPhrase,
    '',
    networks.opnetTestnet,
    MLDSASecurityLevel.LEVEL2,
);
const wallet = mnemonic.derive(0);

// Collection parameters
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'Test Agent 01 Collection';
const COLLECTION_SYMBOL = process.env.COLLECTION_SYMBOL || 'TA01';
const MAX_SUPPLY = process.env.MAX_SUPPLY || '100';

// Build request body
const body = JSON.stringify({
    address: walletData.p2trAddress,
    name: COLLECTION_NAME,
    symbol: COLLECTION_SYMBOL,
    maxSupply: MAX_SUPPLY,
    baseURI: 'https://img.easyweb3.tools/easyweb3.jpg',
    collectionBanner: 'https://img.easyweb3.tools/easyweb3.jpg',
    collectionIcon: 'https://img.easyweb3.tools/easyweb3.jpg',
    collectionWebsite: 'https://www.easyweb3.tools',
    collectionDescription: 'Test Agent 01 NFT Collection on EasyWeb3',
});

console.log('\nRequest body:', body.substring(0, 120) + '...');

// Sign the body with ML-DSA
console.log('\nSigning request body with ML-DSA...');
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

// POST to /api/agent/create-collection
console.log('\nPOSTing to', `${BASE_URL}/agent/create-collection ...`);
try {
    const response = await fetch(`${BASE_URL}/agent/create-collection`, {
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
        console.log('Response:', JSON.stringify(json, null, 2));

        if (json.success && json.data) {
            console.log('\n=== Collection Deployed Successfully ===');
            console.log('Contract address:', json.data.contractAddress || 'N/A');
            console.log('Deployment TX hash:', json.data.deploymentTxHash || json.data.txHash || 'N/A');

            // Persist deployed collection info for step3/step5 retries.
            walletData.collectionContractAddress = json.data.contractAddress || '';
            walletData.collectionContractPublicKey = json.data.contractPublicKey || '';
            walletData.collectionDeploymentTxHash = json.data.deploymentTxHash || '';
            writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
            console.log('Updated wallet.json with collection contract info');
        }
    } catch {
        console.log('Raw response:', text.substring(0, 500));
    }
} catch (err) {
    console.error('FETCH FAILED:', err.message);
}

// Cleanup
if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
if (typeof wallet.zeroize === 'function') wallet.zeroize();

console.log('\n=== Step 2 Complete ===');
