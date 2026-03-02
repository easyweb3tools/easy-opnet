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
import { env } from '../config/env.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';
import { getNetwork } from '../config/network.js';
import { getListingState, getListingCount } from '../market/EscrowManager.js';
import {
    getTokenOwner,
    getTokenURI,
    getBalanceOf,
    getTokenOfOwnerByIndex,
} from '../nft/TokenIndexer.js';
import { getAgentsByOwner, isRegisteredAgent } from '../agents/AgentRegistry.js';
import { normalizeAgentAddress } from '../agents/AddressValidator.js';
import { getProvider } from '../providers/ProviderManager.js';
import {
    getImportedCollection,
    getImportedCollectionsByAgent,
    getAgentsByImportedContract,
    getAgentCollectionContractAddress,
    getAgentCollectionId,
    getAgentOwnerAddress,
    getAgentPublicKey,
    getCollectionByCreatorAgent,
    listCollectionsByCreatorAgent,
    ImportedCollectionRecord,
} from '../store/CollectionStore.js';
import { resolveAddressWithPublicKey } from '../providers/AddressResolver.js';
import { getContract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';
import { resolveDefaultCollectionContract } from '../nft/CollectionResolver.js';

// ── Routes ──

export const publicRoutes = new Hono();
const ALLOW_DEV_SEED_LISTINGS = process.env.ALLOW_DEV_SEED_LISTINGS === '1'
    || (env.network === 'regtest' && process.env.ALLOW_DEV_SEED_LISTINGS !== '0');

function shouldRequireChainReadiness(): boolean {
    return !ALLOW_DEV_SEED_LISTINGS;
}

const F = BitcoinAbiTypes.Function;
const OP721_METADATA_ABI: BitcoinInterfaceAbi = [
    {
        name: 'name',
        type: F,
        inputs: [],
        outputs: [{ name: 'name', type: ABIDataTypes.STRING }],
    },
    {
        name: 'symbol',
        type: F,
        inputs: [],
        outputs: [{ name: 'symbol', type: ABIDataTypes.STRING }],
    },
    {
        name: 'totalSupply',
        type: F,
        inputs: [],
        outputs: [{ name: 'totalSupply', type: ABIDataTypes.UINT256 }],
    },
];

function normalizeContractAddress(address: string): string {
    return address.trim().toLowerCase();
}

interface MetadataResult {
    decoded?: Record<string, unknown>;
    result?: unknown;
}

type MetadataMethod = () => Promise<MetadataResult>;

function decodeStringField(result: MetadataResult, key: string): string | undefined {
    if (result.decoded && typeof result.decoded[key] === 'string') {
        return result.decoded[key] as string;
    }
    if (result.result && typeof result.result === 'string') {
        return result.result;
    }
    return undefined;
}

function decodeUintField(result: MetadataResult, key: string): bigint | undefined {
    if (result.decoded && result.decoded[key] != null) {
        return BigInt(String(result.decoded[key]));
    }
    if (result.result != null) {
        return BigInt(String(result.result));
    }
    return undefined;
}

async function loadCollectionMetadata(contractAddress: string): Promise<{
    name?: string;
    symbol?: string;
    totalSupply?: number;
}> {
    try {
        const provider = getProvider();
        const resolved = await resolveAddressWithPublicKey(contractAddress, true);
        const contract = getContract(
            resolved,
            OP721_METADATA_ABI,
            provider,
            getNetwork(env.network),
        );

        const metadataContract = contract as unknown as Record<string, MetadataMethod>;
        const nameFn = metadataContract.name;
        const symbolFn = metadataContract.symbol;
        const totalSupplyFn = metadataContract.totalSupply;

        const metadata: {
            name?: string;
            symbol?: string;
            totalSupply?: number;
        } = {};

        if (nameFn) {
            const result = await nameFn();
            const value = decodeStringField(result, 'name');
            if (value) {
                metadata.name = value;
            }
        }

        if (symbolFn) {
            const result = await symbolFn();
            const value = decodeStringField(result, 'symbol');
            if (value) {
                metadata.symbol = value;
            }
        }

        if (totalSupplyFn) {
            const result = await totalSupplyFn();
            const value = decodeUintField(result, 'totalSupply');
            if (value !== undefined) {
                metadata.totalSupply = value > BigInt(Number.MAX_SAFE_INTEGER)
                    ? Number.MAX_SAFE_INTEGER
                    : Number(value);
            }
        }

        return metadata;
    } catch {
        return {};
    }
}

function sortListings(listings: Listing[], sort: string): void {
    switch (sort) {
        case 'price_asc':
            listings.sort((a, b) => {
                const left = BigInt(a.price);
                const right = BigInt(b.price);
                if (left === right) return 0;
                return left < right ? -1 : 1;
            });
            break;
        case 'price_desc':
            listings.sort((a, b) => {
                const left = BigInt(a.price);
                const right = BigInt(b.price);
                if (left === right) return 0;
                return left > right ? -1 : 1;
            });
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
    const missing = getMissingChainConfigKeys();
    if (missing.length > 0 && shouldRequireChainReadiness()) {
        return c.json({ success: false, error: readinessErrorMessage(missing) }, 503);
    }

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
        const missing = getMissingChainConfigKeys();
        if (missing.length > 0 && shouldRequireChainReadiness()) {
            return c.json({ success: false, error: readinessErrorMessage(missing) }, 503);
        }

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
                getTokenOwner(state.tokenId, state.nftContract),
                getTokenURI(state.tokenId, state.nftContract),
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
        if (ALLOW_DEV_SEED_LISTINGS && listings.length === 0) {
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
        const missing = getMissingChainConfigKeys();
        if (missing.length > 0 && shouldRequireChainReadiness()) {
            return c.json({ success: false, error: readinessErrorMessage(missing) }, 503);
        }

        let listing: Listing | null = null;

        // On-chain ids are numeric. Non-numeric ids are handled by dev seed fallback.
        if (/^\d+$/.test(id)) {
            const state = await getListingState(id);

            if (state) {
                // Enrich NFT data
                const [owner, tokenUri] = await Promise.all([
                    getTokenOwner(state.tokenId, state.nftContract),
                    getTokenURI(state.tokenId, state.nftContract),
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

        if (!listing && ALLOW_DEV_SEED_LISTINGS) {
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
        const nftContractAddress = (c.req.query('contract') ?? '').trim().toLowerCase()
            || await resolveDefaultCollectionContract();
        if (!nftContractAddress) {
            return c.json({ success: false, error: 'No deployed collections found' }, 404);
        }

        const [owner, tokenUri] = await Promise.all([
            getTokenOwner(tokenId, nftContractAddress),
            getTokenURI(tokenId, nftContractAddress),
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
    const missing = getMissingNftConfigKeys();
    if (missing.length > 0) {
        return c.json({ success: false, error: readinessErrorMessage(missing) }, 503);
    }

    try {
        const storedCollection = await getCollectionByCreatorAgent(address);
        const [fallbackContractAddress, fallbackCollectionId] = storedCollection
            ? [null, null]
            : await Promise.all([
                getAgentCollectionContractAddress(address),
                getAgentCollectionId(address),
            ]);
        const collectionContractAddress = storedCollection?.contractAddress ?? fallbackContractAddress;
        const collectionId = storedCollection?.collectionId ?? fallbackCollectionId;
        if (!collectionContractAddress) {
            return c.json({ success: false, error: 'Agent not found (no deployed collection)' }, 404);
        }

        const storedAgentPublicKey = await getAgentPublicKey(address);
        const [registered, balance, storedOwner] = await Promise.all([
            isRegisteredAgent(
                address,
                collectionContractAddress,
                storedAgentPublicKey ?? storedCollection?.creatorAgentPublicKey,
            ),
            getBalanceOf(
                address,
                collectionContractAddress,
                storedAgentPublicKey ?? storedCollection?.creatorAgentPublicKey,
                collectionId ?? undefined,
            ),
            getAgentOwnerAddress(address),
        ]);

        if (!registered && !storedOwner) {
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
            publicKey: storedAgentPublicKey ?? storedCollection?.creatorAgentPublicKey ?? '',
            registeredAt: '',
            status: registered ? 'active' as const : 'inactive' as const,
            stats: {
                minted,
                trades,
                volume: volume.toString(),
                listed,
            },
        };

        // Get agent NFTs directly from chain state for better eventual consistency.
        const nfts: NFT[] = [];
        const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
        const isHubCollection = normalizedHubAddress
            && collectionContractAddress.trim().toLowerCase() === normalizedHubAddress;
        const maxNftsToFetch = isHubCollection ? 0 : Number(balance > 50n ? 50n : balance);
        for (let i = 0; i < maxNftsToFetch; i += 1) {
            const tokenId = await getTokenOfOwnerByIndex(
                address,
                BigInt(i),
                collectionContractAddress,
                storedAgentPublicKey ?? storedCollection?.creatorAgentPublicKey,
            );
            if (!tokenId) continue;

            const [owner, tokenUri] = await Promise.all([
                getTokenOwner(tokenId, collectionContractAddress),
                getTokenURI(tokenId, collectionContractAddress),
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

publicRoutes.get('/collection/:address', async (c) => {
    const contractParam = c.req.param('address');
    const contractAddress = normalizeContractAddress(contractParam);

    try {
        const platformCollection = await getCollectionByCreatorAgent(contractAddress);
        const importedAgents = await getAgentsByImportedContract(contractAddress);
        const importedRecords = (await Promise.all(
            importedAgents.map((agent) => getImportedCollection(agent, contractAddress)),
        )).filter((entry): entry is ImportedCollectionRecord => Boolean(entry));
        const metadata = await loadCollectionMetadata(contractAddress);

        const response = {
            contractAddress,
            name: platformCollection?.name
                ?? metadata.name
                ?? importedRecords[0]?.name
                ?? '',
            symbol: platformCollection?.symbol
                ?? metadata.symbol
                ?? importedRecords[0]?.symbol
                ?? '',
            source: platformCollection ? 'platform' : 'imported',
            importedBy: Array.from(new Set(importedAgents)),
            totalSupply: metadata.totalSupply ?? 0,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        console.error('Failed to fetch collection:', err);
        return c.json({ success: false, error: 'Failed to fetch collection' }, 500);
    }
});

publicRoutes.get('/agent/:address/collections', async (c) => {
    const address = c.req.param('address');
    const normalized = normalizeAgentAddress(address);

    try {
        const platformCollections = await listCollectionsByCreatorAgent(normalized);
        const imported = await getImportedCollectionsByAgent(normalized);

        return c.json({
            success: true,
            data: {
                platform: platformCollections,
                imported,
            },
        });
    } catch (err) {
        console.error('Failed to fetch agent collections:', err);
        return c.json({ success: false, error: 'Failed to fetch agent collections' }, 500);
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

// GET /api/public/agents-by-owner/:address
publicRoutes.get('/agents-by-owner/:address', async (c) => {
    const ownerAddress = c.req.param('address').trim().toLowerCase();
    const agents = await getAgentsByOwner(ownerAddress);

    return c.json({
        success: true,
        data: {
            ownerAddress,
            agents,
        },
    });
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
