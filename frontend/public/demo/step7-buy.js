/**
 * Step 7: Buy Listing
 * Following: https://www.easyweb3.tools/skill.md
 *
 * Finds an active listing from /api/public/listings, then POSTs to /api/agent/buy.
 * Required body fields: address, listingId.
 */

import {
    Mnemonic,
    MLDSASecurityLevel,
    MessageSigner,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE_URL = process.env.API_URL || 'https://www.easyweb3.tools/api';

console.log('=== Step 7: Buy Listing ===\n');
console.log('API Base URL:', BASE_URL);

const walletData = JSON.parse(readFileSync('wallet.json', 'utf-8'));
console.log('Buyer address:', walletData.p2trAddress);

let targetListingId = process.env.LISTING_ID || '';

if (!targetListingId) {
    console.log('\nFetching active listings...');
    try {
        const listingsRes = await fetch(`${BASE_URL}/public/listings?status=active&sort=newest&limit=20`);
        const listingsJson = await listingsRes.json();

        if (listingsJson.success && listingsJson.data?.items?.length) {
            const allowSelfBuy = process.env.ALLOW_SELF_BUY === '1';
            const candidate = listingsJson.data.items.find((item) => {
                return allowSelfBuy || item.seller !== walletData.p2trAddress;
            });

            if (candidate?.id) {
                targetListingId = String(candidate.id);
                console.log('Selected listing:', targetListingId, `(seller: ${candidate.seller})`);
            }
        }
    } catch (err) {
        console.error('Failed to fetch listings:', err.message);
    }
}

if (!targetListingId) {
    console.log('No buyable listing found. Set LISTING_ID or ALLOW_SELF_BUY=1 and retry.');
    process.exit(0);
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
    listingId: String(targetListingId),
});

let signatureHex;
try {
    const signResult = MessageSigner.signMLDSAMessage(wallet.mldsaKeypair, body);
    signatureHex = Buffer.from(signResult.signature).toString('hex');
} catch (err) {
    console.error('SIGNING FAILED:', err.message);
    process.exit(1);
}

console.log('\nPOSTing to', `${BASE_URL}/agent/buy ...`);
try {
    const response = await fetch(`${BASE_URL}/agent/buy`, {
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
            console.log('\n=== Listing Bought Successfully ===');
            console.log('TX hash:', json.data.txHash || 'N/A');
            walletData.lastBoughtListingId = String(targetListingId);
            walletData.lastBuyTxHash = json.data.txHash || '';
            writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
            console.log('Updated wallet.json with lastBoughtListingId');
        }
    } catch {
        console.log('Raw response:', text.substring(0, 500));
    }
} catch (err) {
    console.error('FETCH FAILED:', err.message);
}

if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
if (typeof wallet.zeroize === 'function') wallet.zeroize();

console.log('\n=== Step 7 Complete ===');
