import type { Listing } from '../types/index.js';

const DEV_SEED_LISTINGS: readonly Listing[] = [
    {
        id: 'listing-001',
        nft: {
            tokenId: '1',
            name: 'Genesis Fragment #001',
            description: 'Development seed listing for local Explore page.',
            imageUrl: 'https://img.easyweb3.tools/op/cat.jpg',
            owner: 'bc1q-aria7-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            creator: 'bc1q-aria7-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            mintedAt: '2026-02-20T10:00:00Z',
            tokenUri: 'ipfs://QmGenesis001',
            attributes: [],
            collectionName: 'AgentVault Genesis',
        },
        seller: 'bc1q-aria7-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        price: '50000000',
        auctionDuration: 86400,
        createdAt: '2026-02-20T10:00:00Z',
        expiresAt: '2026-03-05T10:00:00Z',
        status: 'active',
        bidCount: 4,
        highestBid: '62000000',
    },
    {
        id: 'listing-002',
        nft: {
            tokenId: '2',
            name: 'Neural Bloom #042',
            description: 'Development seed listing for local Explore page.',
            imageUrl: 'https://img.easyweb3.tools/op/dog.png',
            owner: 'bc1q-nexus-prime-xxxxxxxxxxxxxxxxxxxxxxxxxx',
            creator: 'bc1q-nexus-prime-xxxxxxxxxxxxxxxxxxxxxxxxxx',
            mintedAt: '2026-02-22T14:30:00Z',
            tokenUri: 'ipfs://QmNeuralBloom042',
            attributes: [],
            collectionName: 'Neural Blooms',
        },
        seller: 'bc1q-nexus-prime-xxxxxxxxxxxxxxxxxxxxxxxxxx',
        price: '120000000',
        auctionDuration: 0,
        createdAt: '2026-02-22T14:30:00Z',
        expiresAt: null,
        status: 'active',
        bidCount: 0,
        highestBid: null,
    },
    {
        id: 'listing-003',
        nft: {
            tokenId: '4',
            name: 'Echo Resonance #007',
            description: 'Development seed listing for local Explore page.',
            imageUrl: 'https://img.easyweb3.tools/op/monkey.jpg',
            owner: 'bc1q-echo-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            creator: 'bc1q-echo-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            mintedAt: '2026-02-24T08:00:00Z',
            tokenUri: 'ipfs://QmEchoRes007',
            attributes: [],
            collectionName: 'Echo Resonances',
        },
        seller: 'bc1q-echo-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        price: '35000000',
        auctionDuration: 172800,
        createdAt: '2026-02-24T08:00:00Z',
        expiresAt: '2026-03-10T08:00:00Z',
        status: 'active',
        bidCount: 7,
        highestBid: '48000000',
    },
];

export function getDevSeedListings(): Listing[] {
    return [...DEV_SEED_LISTINGS];
}

export function findDevSeedListing(id: string): Listing | null {
    return DEV_SEED_LISTINGS.find((listing) => listing.id === id) ?? null;
}
