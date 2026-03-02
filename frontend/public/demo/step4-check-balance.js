/**
 * Step 4: Explore Public APIs
 * Following: https://www.easyweb3.tools/skill.md
 *
 * Uses public (unauthenticated) endpoints to explore the marketplace.
 */

import { readFileSync } from 'node:fs';

const BASE_URL = process.env.API_URL || 'https://www.easyweb3.tools/api';

console.log('=== Step 4: Explore Public APIs ===\n');
console.log('API Base URL:', BASE_URL);

const walletData = JSON.parse(readFileSync('wallet.json', 'utf-8'));
console.log('Agent address:', walletData.p2trAddress);

// 1. Check marketplace stats
console.log('\n--- Marketplace Stats ---');
try {
    const res = await fetch(`${BASE_URL}/public/stats`);
    const json = await res.json();
    console.log('HTTP status:', res.status);
    console.log('Response:', JSON.stringify(json, null, 2));
} catch (err) {
    console.error('Stats check failed:', err.message);
}

// 2. List marketplace listings
console.log('\n--- Active Listings ---');
try {
    const res = await fetch(`${BASE_URL}/public/listings?limit=5`);
    const json = await res.json();
    console.log('HTTP status:', res.status);
    if (json.success && json.data) {
        console.log(`Total listings: ${json.data.total}`);
        console.log(`Showing: ${json.data.items.length} items`);
        for (const listing of json.data.items) {
            console.log(`  - Listing #${listing.id}: ${listing.nft?.name || 'Unknown'} @ ${listing.price} sats (${listing.status})`);
        }
    } else {
        console.log('Response:', JSON.stringify(json, null, 2));
    }
} catch (err) {
    console.error('Listings check failed:', err.message);
}

// 3. Check recent activity
console.log('\n--- Recent Activity ---');
try {
    const res = await fetch(`${BASE_URL}/public/activity?limit=5`);
    const json = await res.json();
    console.log('HTTP status:', res.status);
    if (json.success && json.data) {
        console.log(`Total events: ${json.data.total}`);
        for (const event of json.data.items) {
            console.log(`  - [${event.type}] ${event.nftName || event.tokenId || ''} by ${event.agent?.substring(0, 20)}...`);
        }
    } else {
        console.log('Response:', JSON.stringify(json, null, 2));
    }
} catch (err) {
    console.error('Activity check failed:', err.message);
}

// 4. Check agent profile (may 404 if not yet registered)
console.log('\n--- Agent Profile ---');
try {
    const res = await fetch(`${BASE_URL}/public/agent/${walletData.p2trAddress}`);
    const json = await res.json();
    console.log('HTTP status:', res.status);
    console.log('Response:', JSON.stringify(json, null, 2));
} catch (err) {
    console.error('Agent profile check failed:', err.message);
}

console.log('\n=== Step 4 Complete ===');
