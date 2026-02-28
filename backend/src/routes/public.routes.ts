import { Hono } from 'hono';
import type {
    PaginatedResponse,
    Listing,
    NFT,
    Bid,
    ActivityEvent,
} from '../types/index.js';

import { computeStats } from '../store/StatsAggregator.js';
import { query as queryActivity, getEventsByAgent } from '../store/ActivityStore.js';
import { getDevSeedListings, findDevSeedListing } from '../store/DevSeedListings.js';
import { getMissingChainConfigKeys, getMissingNftConfigKeys, readinessErrorMessage } from '../config/readiness.js';
import { getListingState, getListingCount } from '../market/EscrowManager.js';
import { getTokenOwner, getTokenURI, getBalanceOf } from '../nft/TokenIndexer.js';
import { isRegisteredAgent } from '../agents/AgentRegistry.js';
import { getProvider } from '../providers/ProviderManager.js';

// ── Routes ──

export const publicRoutes = new Hono();

function sortListings(listings: Listing[], sort: string): void {
    switch (sort) {
        case 'price_asc':
            listings.sort((a, b) => Number(BigInt(a.price) - BigInt(b.price)));
            break;
        case 'price_desc':
            listings.sort((a, b) => Number(BigInt(b.price) - BigInt(a.price)));
            break;
        case 'most_bids':
            listings.sort((a, b) => b.bidCount - a.bidCount);
            break;
        case 'ending_soon':
            listings.sort((a, b) => {
                if (!a.expiresAt) return 1;
                if (!b.expiresAt) return -1;
                return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
            });
            break;
        default: {
            listings.sort((a, b) => {
                const timeA = new Date(a.createdAt).getTime();
                const timeB = new Date(b.createdAt).getTime();
                const hasTimeA = !Number.isNaN(timeA);
                const hasTimeB = !Number.isNaN(timeB);

                if (hasTimeA && hasTimeB) return timeB - timeA;

                const idA = Number(a.id);
                const idB = Number(b.id);
                const hasIdA = !Number.isNaN(idA);
                const hasIdB = !Number.isNaN(idB);

                if (hasIdA && hasIdB) return idB - idA;
                return b.id.localeCompare(a.id);
            });
        }
    }
}

// GET /api/public/stats
publicRoutes.get('/stats', async (c) => {
    try {
        const stats = await computeStats();
        return c.json({ success: true, data: stats });
    } catch (err) {
        console.error('Failed to compute stats:', err);
        return c.json({ success: false, error: 'Failed to fetch stats' }, 500);
    }
});

// GET /api/public/listings
publicRoutes.get('/listings', async (c) => {
    const sort = c.req.query('sort') ?? 'newest';
    const status = c.req.query('status') ?? 'active';
    const minPrice = c.req.query('minPrice');
    const maxPrice = c.req.query('maxPrice');
    const agent = c.req.query('agent');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    try {
        const totalCount = await getListingCount();
        const listings: Listing[] = [];

        // Iterate all listings from contract and enrich with NFT data
        for (let i = 0; i < totalCount; i++) {
            const state = await getListingState(String(i));
            if (!state) continue;

            // Map contract status to string
            const statusStr = state.status === 1 ? 'active'
                : state.status === 2 ? 'sold'
                : state.status === 3 ? 'cancelled'
                : 'expired';

            // Filter by status
            if (status !== 'all' && statusStr !== status) continue;

            // Filter by agent
            if (agent && state.seller !== agent) continue;

            // Filter by price range
            const price = BigInt(state.price);
            if (minPrice && price < BigInt(minPrice)) continue;
            if (maxPrice && price > BigInt(maxPrice)) continue;

            // Enrich NFT data
            const [owner, tokenUri] = await Promise.all([
                getTokenOwner(state.tokenId),
                getTokenURI(state.tokenId),
            ]);

            const nft: NFT = {
                tokenId: state.tokenId,
                name: `NFT #${state.tokenId}`,
                description: '',
                imageUrl: '',
                owner: owner ?? state.seller,
                creator: state.seller,
                mintedAt: '',
                tokenUri: tokenUri ?? '',
                attributes: [],
                collectionName: 'AgentVault',
            };

            const expiration = Number(state.auctionDuration) > 0
                ? new Date(Number(state.expiration) * 1000).toISOString()
                : null;

            listings.push({
                id: String(i),
                nft,
                seller: state.seller,
                price: state.price,
                auctionDuration: Number(state.auctionDuration),
                createdAt: '', // Not stored on-chain
                expiresAt: expiration,
                status: statusStr,
                bidCount: state.bidCount,
                highestBid: state.highestBid !== '0' ? state.highestBid : null,
            });
        }

        // Dev fallback: when chain has no data, serve seeded listings.
        if (listings.length === 0) {
            listings.push(...getDevSeedListings());
        }

        // Filters (applied again so seeded listings follow the same query behavior).
        let filtered = listings;
        if (status !== 'all') {
            filtered = filtered.filter((l) => l.status === status);
        }
        if (agent) {
            filtered = filtered.filter((l) => l.seller === agent);
        }
        if (minPrice) {
            filtered = filtered.filter((l) => BigInt(l.price) >= BigInt(minPrice));
        }
        if (maxPrice) {
            filtered = filtered.filter((l) => BigInt(l.price) <= BigInt(maxPrice));
        }

        sortListings(filtered, sort);

        const total = filtered.length;
        const items = filtered.slice(offset, offset + limit);

        const response: PaginatedResponse<Listing> = { items, total, offset, limit };
        return c.json({ success: true, data: response });
    } catch (err) {
        console.error('Failed to fetch listings:', err);
        return c.json({ success: false, error: 'Failed to fetch listings' }, 500);
    }
});

// GET /api/public/listing/:id
publicRoutes.get('/listing/:id', async (c) => {
    const id = c.req.param('id');

    try {
        let listing: Listing | null = null;

        // On-chain ids are numeric. Non-numeric ids are handled by dev seed fallback.
        if (/^\d+$/.test(id)) {
            const state = await getListingState(id);

            if (state) {
                // Enrich NFT data
                const [owner, tokenUri] = await Promise.all([
                    getTokenOwner(state.tokenId),
                    getTokenURI(state.tokenId),
                ]);

                const nft: NFT = {
                    tokenId: state.tokenId,
                    name: `NFT #${state.tokenId}`,
                    description: '',
                    imageUrl: '',
                    owner: owner ?? state.seller,
                    creator: state.seller,
                    mintedAt: '',
                    tokenUri: tokenUri ?? '',
                    attributes: [],
                    collectionName: 'AgentVault',
                };

                const statusStr = state.status === 1 ? 'active'
                    : state.status === 2 ? 'sold'
                    : state.status === 3 ? 'cancelled'
                    : 'expired';

                const expiration = Number(state.auctionDuration) > 0
                    ? new Date(Number(state.expiration) * 1000).toISOString()
                    : null;

                listing = {
                    id,
                    nft,
                    seller: state.seller,
                    price: state.price,
                    auctionDuration: Number(state.auctionDuration),
                    createdAt: '',
                    expiresAt: expiration,
                    status: statusStr,
                    bidCount: state.bidCount,
                    highestBid: state.highestBid !== '0' ? state.highestBid : null,
                };
            }
        }

        if (!listing) {
            listing = findDevSeedListing(id);
        }
        if (!listing) {
            return c.json({ success: false, error: 'Listing not found' }, 404);
        }

        // Get bid history from ActivityStore
        const { items: allActivity } = queryActivity({ type: 'bid', limit: 1000 });
        const bids: Bid[] = allActivity
            .filter((e) => e.listingId === id)
            .map((e, idx) => ({
                id: `bid-${e.id}`,
                listingId: id,
                bidder: e.agent,
                amount: e.amount ?? '0',
                createdAt: e.timestamp,
                status: idx === 0 ? 'active' as const : 'outbid' as const,
            }));

        return c.json({ success: true, data: { listing, bids } });
    } catch (err) {
        console.error('Failed to fetch listing:', err);
        return c.json({ success: false, error: 'Failed to fetch listing' }, 500);
    }
});

// GET /api/public/nft/:tokenId
publicRoutes.get('/nft/:tokenId', async (c) => {
    const tokenId = c.req.param('tokenId');
    const missing = getMissingNftConfigKeys();
    if (missing.length > 0) {
        return c.json({ success: false, error: readinessErrorMessage(missing) }, 503);
    }

    try {
        const [owner, tokenUri] = await Promise.all([
            getTokenOwner(tokenId),
            getTokenURI(tokenId),
        ]);

        if (!owner) {
            return c.json({ success: false, error: 'NFT not found' }, 404);
        }

        const nft: NFT = {
            tokenId,
            name: `NFT #${tokenId}`,
            description: '',
            imageUrl: '',
            owner,
            creator: '',
            mintedAt: '',
            tokenUri: tokenUri ?? '',
            attributes: [],
            collectionName: 'AgentVault',
        };

        return c.json({ success: true, data: nft });
    } catch (err) {
        console.error('Failed to fetch NFT:', err);
        return c.json({ success: false, error: 'Failed to fetch NFT' }, 500);
    }
});

// GET /api/public/agent/:address
publicRoutes.get('/agent/:address', async (c) => {
    const address = c.req.param('address');
    const missing = getMissingChainConfigKeys();
    if (missing.length > 0) {
        return c.json({ success: false, error: readinessErrorMessage(missing) }, 503);
    }

    try {
        const [registered, balance] = await Promise.all([
            isRegisteredAgent(address),
            getBalanceOf(address),
        ]);

        if (!registered) {
            return c.json({ success: false, error: 'Agent not found' }, 404);
        }

        // Compute agent stats from ActivityStore
        const agentEvents = getEventsByAgent(address);
        const minted = agentEvents.filter((e) => e.type === 'mint').length;
        const sales = agentEvents.filter((e) => e.type === 'sale');
        const trades = sales.length;
        const volume = sales.reduce((sum, e) => sum + BigInt(e.amount ?? '0'), 0n);
        const listed = agentEvents.filter((e) => e.type === 'list').length;

        const agent = {
            address,
            name: '',
            avatar: '',
            publicKey: '',
            registeredAt: '',
            status: 'active' as const,
            stats: {
                minted,
                trades,
                volume: volume.toString(),
                listed,
            },
        };

        // Get agent's NFTs (look through activity for minted tokenIds)
        const mintedTokenIds = agentEvents
            .filter((e) => e.type === 'mint' && e.tokenId)
            .map((e) => e.tokenId!);

        const nfts: NFT[] = [];
        for (const tokenId of mintedTokenIds) {
            const [owner, tokenUri] = await Promise.all([
                getTokenOwner(tokenId),
                getTokenURI(tokenId),
            ]);
            if (owner) {
                nfts.push({
                    tokenId,
                    name: `NFT #${tokenId}`,
                    description: '',
                    imageUrl: '',
                    owner,
                    creator: address,
                    mintedAt: '',
                    tokenUri: tokenUri ?? '',
                    attributes: [],
                    collectionName: 'AgentVault',
                });
            }
        }

        // Get agent's active listings
        const totalListingCount = await getListingCount();
        const listings: Listing[] = [];
        for (let i = 0; i < totalListingCount; i++) {
            const state = await getListingState(String(i));
            if (!state || state.seller !== address || state.status !== 1) continue;

            const matchingNft = nfts.find((n) => n.tokenId === state.tokenId);
            const nft: NFT = matchingNft ?? {
                tokenId: state.tokenId,
                name: `NFT #${state.tokenId}`,
                description: '',
                imageUrl: '',
                owner: address,
                creator: address,
                mintedAt: '',
                tokenUri: '',
                attributes: [],
                collectionName: 'AgentVault',
            };

            const expiration = Number(state.auctionDuration) > 0
                ? new Date(Number(state.expiration) * 1000).toISOString()
                : null;

            listings.push({
                id: String(i),
                nft,
                seller: state.seller,
                price: state.price,
                auctionDuration: Number(state.auctionDuration),
                createdAt: '',
                expiresAt: expiration,
                status: 'active',
                bidCount: state.bidCount,
                highestBid: state.highestBid !== '0' ? state.highestBid : null,
            });
        }

        return c.json({ success: true, data: { agent, nfts, listings, balance: balance.toString() } });
    } catch (err) {
        console.error('Failed to fetch agent:', err);
        return c.json({ success: false, error: 'Failed to fetch agent' }, 500);
    }
});

// GET /api/public/activity
publicRoutes.get('/activity', (c) => {
    const type = c.req.query('type') ?? 'all';
    const agent = c.req.query('agent');
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = queryActivity({
        type: type as ActivityEvent['type'] | 'all',
        agent: agent ?? undefined,
        limit,
        offset,
    });

    const response: PaginatedResponse<ActivityEvent> = {
        items: result.items,
        total: result.total,
        offset,
        limit,
    };
    return c.json({ success: true, data: response });
});

// GET /api/public/balance/:address
// Queries BTC balance directly from OPNet RPC. No registration required.
publicRoutes.get('/balance/:address', async (c) => {
    const address = c.req.param('address');

    try {
        const provider = getProvider();
        const balance = await provider.getBalance(address, true);

        return c.json({
            success: true,
            data: {
                address,
                balance: balance.toString(),
            },
        });
    } catch (err) {
        console.error('Failed to fetch balance:', err);
        return c.json({ success: false, error: 'Failed to fetch balance' }, 500);
    }
});
