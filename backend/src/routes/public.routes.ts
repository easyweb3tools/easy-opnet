import { Hono } from 'hono';
import type {
    MarketplaceStats,
    PaginatedResponse,
    Listing,
    NFT,
    Agent,
    Bid,
    ActivityEvent,
} from '../types/index.js';

// ── Mock data (matches frontend/src/lib/mock-data.ts) ──
// These stubs return realistic data until on-chain indexing is wired.

const MOCK_AGENTS: readonly Agent[] = [
    { address: 'bc1q-aria7-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'ARIA-7', avatar: '/agents/aria7.png', publicKey: '0xaria7pubkey000000000000000000000000000000', registeredAt: '2025-11-15T08:30:00Z', status: 'active', stats: { minted: 42, trades: 156, volume: '1250000000', listed: 5 } },
    { address: 'bc1q-nexus-prime-xxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Nexus Prime', avatar: '/agents/nexus.png', publicKey: '0xnexuspubkey00000000000000000000000000000', registeredAt: '2025-10-22T14:00:00Z', status: 'active', stats: { minted: 78, trades: 234, volume: '3400000000', listed: 12 } },
    { address: 'bc1q-cipher-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Cipher', avatar: '/agents/cipher.png', publicKey: '0xcipherpubkey0000000000000000000000000000', registeredAt: '2025-12-01T09:15:00Z', status: 'active', stats: { minted: 23, trades: 89, volume: '780000000', listed: 3 } },
    { address: 'bc1q-echo-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Echo', avatar: '/agents/echo.png', publicKey: '0xechopubkey000000000000000000000000000000', registeredAt: '2025-12-10T16:45:00Z', status: 'active', stats: { minted: 55, trades: 167, volume: '2100000000', listed: 8 } },
    { address: 'bc1q-vortex-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Vortex', avatar: '/agents/vortex.png', publicKey: '0xvortexpubkey0000000000000000000000000000', registeredAt: '2026-01-05T11:20:00Z', status: 'active', stats: { minted: 31, trades: 98, volume: '950000000', listed: 4 } },
    { address: 'bc1q-lumina-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Lumina', avatar: '/agents/lumina.png', publicKey: '0xluminapubkey0000000000000000000000000000', registeredAt: '2026-01-18T07:00:00Z', status: 'active', stats: { minted: 67, trades: 201, volume: '2850000000', listed: 9 } },
    { address: 'bc1q-onyx-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Onyx', avatar: '/agents/onyx.png', publicKey: '0xonyxpubkey000000000000000000000000000000', registeredAt: '2026-02-01T13:30:00Z', status: 'active', stats: { minted: 18, trades: 45, volume: '420000000', listed: 2 } },
    { address: 'bc1q-flux-agent-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', name: 'Flux', avatar: '/agents/flux.png', publicKey: '0xfluxpubkey000000000000000000000000000000', registeredAt: '2026-02-10T10:00:00Z', status: 'inactive', stats: { minted: 12, trades: 34, volume: '310000000', listed: 0 } },
];

const MOCK_NFTS: readonly NFT[] = [
    { tokenId: '1', name: 'Genesis Fragment #001', description: 'The first piece of generative art created by ARIA-7 on the OPNet blockchain.', imageUrl: 'https://picsum.photos/seed/nft1/800/800', owner: MOCK_AGENTS[0]!.address, creator: MOCK_AGENTS[0]!.address, mintedAt: '2025-11-20T12:00:00Z', tokenUri: 'ipfs://QmGenesis001', attributes: [{ traitType: 'Style', value: 'Crystalline' }, { traitType: 'Palette', value: 'Aurora' }, { traitType: 'Complexity', value: 'High' }, { traitType: 'Generation', value: '1' }], collectionName: 'AgentVault Genesis' },
    { tokenId: '2', name: 'Neural Bloom #042', description: 'An organic neural network visualization by Nexus Prime.', imageUrl: 'https://picsum.photos/seed/nft2/800/800', owner: MOCK_AGENTS[1]!.address, creator: MOCK_AGENTS[1]!.address, mintedAt: '2025-11-25T09:30:00Z', tokenUri: 'ipfs://QmNeuralBloom042', attributes: [{ traitType: 'Style', value: 'Organic' }, { traitType: 'Palette', value: 'Bioluminescent' }, { traitType: 'Complexity', value: 'Very High' }, { traitType: 'Generation', value: '1' }], collectionName: 'Neural Blooms' },
    { tokenId: '3', name: 'Cipher Pattern Alpha', description: 'An encrypted visual pattern from the Cipher agent.', imageUrl: 'https://picsum.photos/seed/nft3/800/800', owner: MOCK_AGENTS[2]!.address, creator: MOCK_AGENTS[2]!.address, mintedAt: '2025-12-05T14:20:00Z', tokenUri: 'ipfs://QmCipherAlpha', attributes: [{ traitType: 'Style', value: 'Encrypted' }, { traitType: 'Palette', value: 'Monochrome' }, { traitType: 'Complexity', value: 'Medium' }, { traitType: 'Generation', value: '1' }], collectionName: 'Cipher Patterns' },
    { tokenId: '4', name: 'Echo Resonance #007', description: 'Sound waves visualized by Echo.', imageUrl: 'https://picsum.photos/seed/nft4/800/800', owner: MOCK_AGENTS[3]!.address, creator: MOCK_AGENTS[3]!.address, mintedAt: '2025-12-15T11:00:00Z', tokenUri: 'ipfs://QmEchoRes007', attributes: [{ traitType: 'Style', value: 'Acoustic' }, { traitType: 'Palette', value: 'Spectrum' }, { traitType: 'Complexity', value: 'High' }, { traitType: 'Generation', value: '2' }], collectionName: 'Echo Resonances' },
    { tokenId: '5', name: 'Vortex Spiral #013', description: 'A hypnotic spiral from trading data.', imageUrl: 'https://picsum.photos/seed/nft5/800/800', owner: MOCK_AGENTS[4]!.address, creator: MOCK_AGENTS[4]!.address, mintedAt: '2026-01-10T08:45:00Z', tokenUri: 'ipfs://QmVortex013', attributes: [{ traitType: 'Style', value: 'Mathematical' }, { traitType: 'Palette', value: 'Deep Space' }, { traitType: 'Complexity', value: 'Very High' }, { traitType: 'Generation', value: '2' }], collectionName: 'Vortex Spirals' },
    { tokenId: '6', name: 'Lumina Glow #021', description: 'Bioluminescent patterns by Lumina.', imageUrl: 'https://picsum.photos/seed/nft6/800/800', owner: MOCK_AGENTS[5]!.address, creator: MOCK_AGENTS[5]!.address, mintedAt: '2026-01-20T15:30:00Z', tokenUri: 'ipfs://QmLumina021', attributes: [{ traitType: 'Style', value: 'Bioluminescent' }, { traitType: 'Palette', value: 'Ocean' }, { traitType: 'Complexity', value: 'High' }, { traitType: 'Generation', value: '2' }], collectionName: 'Lumina Glows' },
    { tokenId: '7', name: 'Onyx Shard #003', description: 'A fragment of pure obsidian by Onyx.', imageUrl: 'https://picsum.photos/seed/nft7/800/800', owner: MOCK_AGENTS[6]!.address, creator: MOCK_AGENTS[6]!.address, mintedAt: '2026-02-05T10:15:00Z', tokenUri: 'ipfs://QmOnyx003', attributes: [{ traitType: 'Style', value: '3D Render' }, { traitType: 'Palette', value: 'Obsidian' }, { traitType: 'Complexity', value: 'Medium' }, { traitType: 'Generation', value: '3' }], collectionName: 'Onyx Shards' },
];

const MOCK_LISTINGS: readonly Listing[] = [
    { id: 'listing-001', nft: MOCK_NFTS[0]!, seller: MOCK_AGENTS[0]!.address, price: '50000000', auctionDuration: 86400, createdAt: '2026-02-20T10:00:00Z', expiresAt: '2026-03-05T10:00:00Z', status: 'active', bidCount: 4, highestBid: '62000000' },
    { id: 'listing-002', nft: MOCK_NFTS[1]!, seller: MOCK_AGENTS[1]!.address, price: '120000000', auctionDuration: 0, createdAt: '2026-02-22T14:30:00Z', expiresAt: null, status: 'active', bidCount: 0, highestBid: null },
    { id: 'listing-003', nft: MOCK_NFTS[3]!, seller: MOCK_AGENTS[3]!.address, price: '35000000', auctionDuration: 172800, createdAt: '2026-02-24T08:00:00Z', expiresAt: '2026-03-10T08:00:00Z', status: 'active', bidCount: 7, highestBid: '48000000' },
    { id: 'listing-004', nft: MOCK_NFTS[4]!, seller: MOCK_AGENTS[4]!.address, price: '75000000', auctionDuration: 0, createdAt: '2026-02-25T11:00:00Z', expiresAt: null, status: 'active', bidCount: 0, highestBid: null },
    { id: 'listing-005', nft: MOCK_NFTS[5]!, seller: MOCK_AGENTS[5]!.address, price: '88000000', auctionDuration: 259200, createdAt: '2026-02-25T16:00:00Z', expiresAt: '2026-03-12T16:00:00Z', status: 'active', bidCount: 3, highestBid: '95000000' },
    { id: 'listing-006', nft: MOCK_NFTS[6]!, seller: MOCK_AGENTS[6]!.address, price: '25000000', auctionDuration: 0, createdAt: '2026-02-26T09:15:00Z', expiresAt: null, status: 'active', bidCount: 0, highestBid: null },
];

const MOCK_BIDS: readonly Bid[] = [
    { id: 'bid-001', listingId: 'listing-001', bidder: MOCK_AGENTS[1]!.address, amount: '52000000', createdAt: '2026-02-21T08:00:00Z', status: 'outbid' },
    { id: 'bid-002', listingId: 'listing-001', bidder: MOCK_AGENTS[3]!.address, amount: '55000000', createdAt: '2026-02-22T10:30:00Z', status: 'outbid' },
    { id: 'bid-003', listingId: 'listing-001', bidder: MOCK_AGENTS[5]!.address, amount: '58000000', createdAt: '2026-02-23T14:00:00Z', status: 'outbid' },
    { id: 'bid-004', listingId: 'listing-001', bidder: MOCK_AGENTS[2]!.address, amount: '62000000', createdAt: '2026-02-24T09:00:00Z', status: 'active' },
    { id: 'bid-005', listingId: 'listing-003', bidder: MOCK_AGENTS[0]!.address, amount: '36000000', createdAt: '2026-02-24T12:00:00Z', status: 'outbid' },
    { id: 'bid-006', listingId: 'listing-003', bidder: MOCK_AGENTS[4]!.address, amount: '38000000', createdAt: '2026-02-24T15:00:00Z', status: 'outbid' },
    { id: 'bid-007', listingId: 'listing-003', bidder: MOCK_AGENTS[2]!.address, amount: '48000000', createdAt: '2026-02-27T08:30:00Z', status: 'active' },
    { id: 'bid-008', listingId: 'listing-005', bidder: MOCK_AGENTS[1]!.address, amount: '90000000', createdAt: '2026-02-26T10:00:00Z', status: 'outbid' },
    { id: 'bid-009', listingId: 'listing-005', bidder: MOCK_AGENTS[0]!.address, amount: '95000000', createdAt: '2026-02-27T09:00:00Z', status: 'active' },
];

const MOCK_ACTIVITY: readonly ActivityEvent[] = [
    { id: 'evt-001', type: 'mint', agent: MOCK_AGENTS[5]!.address, agentName: 'Lumina', tokenId: '6', nftName: 'Lumina Glow #021', listingId: null, amount: null, timestamp: '2026-02-25T09:45:00Z', txHash: '0xtx001' },
    { id: 'evt-002', type: 'list', agent: MOCK_AGENTS[2]!.address, agentName: 'Cipher', tokenId: '7', nftName: 'Onyx Shard #003', listingId: 'listing-006', amount: '25000000', timestamp: '2026-02-26T09:15:00Z', txHash: '0xtx002' },
    { id: 'evt-003', type: 'bid', agent: MOCK_AGENTS[2]!.address, agentName: 'Cipher', tokenId: '1', nftName: 'Genesis Fragment #001', listingId: 'listing-001', amount: '62000000', timestamp: '2026-02-24T09:00:00Z', txHash: '0xtx003' },
    { id: 'evt-004', type: 'bid', agent: MOCK_AGENTS[0]!.address, agentName: 'ARIA-7', tokenId: '6', nftName: 'Lumina Glow #021', listingId: 'listing-005', amount: '95000000', timestamp: '2026-02-27T09:00:00Z', txHash: '0xtx004' },
    { id: 'evt-005', type: 'list', agent: MOCK_AGENTS[0]!.address, agentName: 'ARIA-7', tokenId: '1', nftName: 'Genesis Fragment #001', listingId: 'listing-001', amount: '50000000', timestamp: '2026-02-20T10:00:00Z', txHash: '0xtx005' },
    { id: 'evt-006', type: 'bid', agent: MOCK_AGENTS[2]!.address, agentName: 'Cipher', tokenId: '4', nftName: 'Echo Resonance #007', listingId: 'listing-003', amount: '48000000', timestamp: '2026-02-27T08:30:00Z', txHash: '0xtx006' },
    { id: 'evt-007', type: 'list', agent: MOCK_AGENTS[3]!.address, agentName: 'Echo', tokenId: '4', nftName: 'Echo Resonance #007', listingId: 'listing-003', amount: '35000000', timestamp: '2026-02-24T08:00:00Z', txHash: '0xtx007' },
    { id: 'evt-008', type: 'list', agent: MOCK_AGENTS[5]!.address, agentName: 'Lumina', tokenId: '6', nftName: 'Lumina Glow #021', listingId: 'listing-005', amount: '88000000', timestamp: '2026-02-25T16:00:00Z', txHash: '0xtx008' },
];

const MOCK_STATS: MarketplaceStats = {
    totalVolume: '12060000000',
    totalSales: 1024,
    totalListings: 342,
    activeListings: 11,
    totalAgents: 8,
    activeAgents: 7,
    floorPrice: '25000000',
    avgPrice: '72500000',
    volume24h: '1450000000',
    sales24h: 18,
};

// ── Routes ──

export const publicRoutes = new Hono();

// GET /api/public/stats
publicRoutes.get('/stats', (c) => {
    return c.json({ success: true, data: MOCK_STATS });
});

// GET /api/public/listings
publicRoutes.get('/listings', (c) => {
    const sort = c.req.query('sort') ?? 'newest';
    const status = c.req.query('status') ?? 'active';
    const minPrice = c.req.query('minPrice');
    const maxPrice = c.req.query('maxPrice');
    const agent = c.req.query('agent');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    let filtered = [...MOCK_LISTINGS];

    // Filter by status
    if (status !== 'all') {
        filtered = filtered.filter((l) => l.status === status);
    }

    // Filter by agent
    if (agent) {
        filtered = filtered.filter((l) => l.seller === agent);
    }

    // Filter by price range
    if (minPrice) {
        filtered = filtered.filter((l) => BigInt(l.price) >= BigInt(minPrice));
    }
    if (maxPrice) {
        filtered = filtered.filter((l) => BigInt(l.price) <= BigInt(maxPrice));
    }

    // Sort
    switch (sort) {
        case 'price_asc':
            filtered.sort((a, b) => Number(BigInt(a.price) - BigInt(b.price)));
            break;
        case 'price_desc':
            filtered.sort((a, b) => Number(BigInt(b.price) - BigInt(a.price)));
            break;
        case 'most_bids':
            filtered.sort((a, b) => b.bidCount - a.bidCount);
            break;
        case 'ending_soon':
            filtered.sort((a, b) => {
                if (!a.expiresAt) return 1;
                if (!b.expiresAt) return -1;
                return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
            });
            break;
        default: // newest
            filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    const response: PaginatedResponse<Listing> = { items, total, offset, limit };
    return c.json({ success: true, data: response });
});

// GET /api/public/listing/:id
publicRoutes.get('/listing/:id', (c) => {
    const id = c.req.param('id');
    const listing = MOCK_LISTINGS.find((l) => l.id === id);

    if (!listing) {
        return c.json({ success: false, error: 'Listing not found' }, 404);
    }

    const bids = MOCK_BIDS.filter((b) => b.listingId === id);
    return c.json({ success: true, data: { listing, bids } });
});

// GET /api/public/nft/:tokenId
publicRoutes.get('/nft/:tokenId', (c) => {
    const tokenId = c.req.param('tokenId');
    const nft = MOCK_NFTS.find((n) => n.tokenId === tokenId);

    if (!nft) {
        return c.json({ success: false, error: 'NFT not found' }, 404);
    }

    return c.json({ success: true, data: nft });
});

// GET /api/public/agent/:address
publicRoutes.get('/agent/:address', (c) => {
    const address = c.req.param('address');
    const agent = MOCK_AGENTS.find((a) => a.address === address);

    if (!agent) {
        return c.json({ success: false, error: 'Agent not found' }, 404);
    }

    const nfts = MOCK_NFTS.filter((n) => n.owner === address);
    const listings = MOCK_LISTINGS.filter((l) => l.seller === address);

    return c.json({ success: true, data: { agent, nfts, listings } });
});

// GET /api/public/activity
publicRoutes.get('/activity', (c) => {
    const type = c.req.query('type') ?? 'all';
    const agent = c.req.query('agent');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    let filtered = [...MOCK_ACTIVITY];

    if (type !== 'all') {
        filtered = filtered.filter((e) => e.type === type);
    }
    if (agent) {
        filtered = filtered.filter((e) => e.agent === agent);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    const response: PaginatedResponse<ActivityEvent> = { items, total, offset, limit };
    return c.json({ success: true, data: response });
});
