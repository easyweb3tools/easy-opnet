/**
 * Step 3: Register Agent on AgentVault
 * Following: https://www.easyweb3.tools/skill.md
 *
 * Signs the request body with ML-DSA and POSTs to /api/agent/register.
 * Requires: collection already deployed (Step 2).
 *
 * The registration now requires owner claim fields:
 * - ownerAddress: the human wallet that owns this agent
 * - ownerPublicKey: owner's ML-DSA public key
 * - ownerSignature: ML-DSA signature of the claim message
 *
 * For testing, the agent signs as its own owner (self-ownership).
 */

import {
    Mnemonic,
    MLDSASecurityLevel,
    MessageSigner,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.API_URL || 'https://www.easyweb3.tools/api';

console.log('=== Step 3: Register Agent on AgentVault ===\n');
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

// For testing, the agent is its own owner (self-ownership).
// In production, a human wallet would sign the ownership claim separately.
const agentAddress = walletData.p2trAddress;
const ownerAddress = walletData.p2trAddress; // Same wallet = self-ownership

// Build the owner claim message (must match backend's buildOwnerClaimMessage)
const ownerClaimMessage = `I claim ownership of agent ${agentAddress} on EasyWeb3 as ${ownerAddress}`;
console.log('\nOwner claim message:', ownerClaimMessage);

// Sign the owner claim message with ML-DSA
console.log('Signing owner claim message...');
let ownerSignatureHex;
try {
    const ownerSignResult = MessageSigner.signMLDSAMessage(
        wallet.mldsaKeypair,
        ownerClaimMessage,
    );
    ownerSignatureHex = Buffer.from(ownerSignResult.signature).toString('hex');
    console.log('Owner signature length:', ownerSignatureHex.length, 'hex chars');
} catch (err) {
    console.error('OWNER SIGNING FAILED:', err.message);
    process.exit(1);
}

// Build request body
const body = JSON.stringify({
    publicKey: walletData.mldsaPublicKeyHex,
    proof: 'registration_proof',
    address: agentAddress,
    ownerAddress: ownerAddress,
    ownerPublicKey: walletData.mldsaPublicKeyHex,
    ownerSignature: ownerSignatureHex,
    ...(walletData.collectionContractAddress
        ? { collectionContractAddress: walletData.collectionContractAddress }
        : {}),
    ...(walletData.collectionContractPublicKey
        ? { collectionContractPublicKey: walletData.collectionContractPublicKey }
        : {}),
    ...(walletData.collectionDeploymentTxHash
        ? { collectionDeploymentTxHash: walletData.collectionDeploymentTxHash }
        : {}),
});

console.log('\nRequest body length:', body.length, 'bytes');

// Sign the body with ML-DSA (for X-Agent-Signature auth header)
console.log('Signing request body with ML-DSA...');
let signatureHex;
try {
    const signResult = MessageSigner.signMLDSAMessage(
        wallet.mldsaKeypair,
        body,
    );
    signatureHex = Buffer.from(signResult.signature).toString('hex');
    console.log('Auth signature length:', signatureHex.length, 'hex chars');
} catch (err) {
    console.error('AUTH SIGNING FAILED:', err.message);
    process.exit(1);
}

// POST to /api/agent/register
console.log('\nPOSTing to', `${BASE_URL}/agent/register ...`);
try {
    const response = await fetch(`${BASE_URL}/agent/register`, {
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
            console.log('\n=== Agent Registered Successfully ===');
            console.log('TX hash:', json.data.txHash || 'N/A');
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

console.log('\n=== Step 3 Complete ===');
