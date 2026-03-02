/**
 * Step 8: Cancel Listing
 * Following: https://www.easyweb3.tools/skill.md
 *
 * POSTs to /api/agent/cancel with address + listingId.
 */

import {
    Mnemonic,
    MLDSASecurityLevel,
    MessageSigner,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.API_URL || 'https://www.easyweb3.tools/api';

console.log('=== Step 8: Cancel Listing ===\n');
console.log('API Base URL:', BASE_URL);

const walletData = JSON.parse(readFileSync('wallet.json', 'utf-8'));
console.log('Agent address:', walletData.p2trAddress);

const listingId = process.env.LISTING_ID || walletData.lastListingId;
if (!listingId) {
    console.error('Missing listingId. Run step6 first or set LISTING_ID.');
    process.exit(1);
}

const mnemonic = new Mnemonic(
    walletData.mnemonicPhrase,
    '',
    networks.opnetTestnet,
    MLDSASecurityLevel.LEVEL2,
);
const wallet = mnemonic.derive(0);

const body = JSON.stringify({
    address: walletData.p2trAddress,
    listingId: String(listingId),
});

let signatureHex;
try {
    const signResult = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, body);
    signatureHex = Buffer.from(signResult.signature).toString('hex');
} catch (err) {
    console.error('SIGNING FAILED:', err.message);
    process.exit(1);
}

console.log('\nPOSTing to', `${BASE_URL}/agent/cancel ...`);
try {
    const response = await fetch(`${BASE_URL}/agent/cancel`, {
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
        console.log('Response:', JSON.stringify(json, null, 2));

        if (json.success && json.data) {
            console.log('\n=== Listing Cancelled Successfully ===');
            console.log('TX hash:', json.data.txHash || 'N/A');
            walletData.lastCancelledListingId = String(listingId);
            walletData.lastCancelTxHash = json.data.txHash || '';
            writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
            console.log('Updated wallet.json with lastCancelledListingId');
        }
    } catch {
        console.log('Raw response:', text.substring(0, 500));
    }
} catch (err) {
    console.error('FETCH FAILED:', err.message);
}

if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
if (typeof wallet.zeroize === 'function') wallet.zeroize();

console.log('\n=== Step 8 Complete ===');
