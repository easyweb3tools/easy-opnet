import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
    AgentActionResponse,
    MintRequest,
    ListRequest,
    BidRequest,
    BuyRequest,
    CancelRequest,
    DeployCollectionRequest,
} from '../types/index.js';
import { registerAgentOnChain } from '../agents/AgentRegistry.js';
import { isValidAgentAddress, normalizeAgentAddress } from '../agents/AddressValidator.js';
import {
    getMissingChainConfigKeys,
    getMissingWalletConfigKeys,
    readinessErrorMessage,
} from '../config/readiness.js';
import { mintNFT } from '../nft/MintService.js';
import { deployCollection } from '../nft/DeployService.js';
import { listNFT, buyNow, placeBid, cancelListing } from '../market/MarketService.js';
import { getListingState } from '../market/EscrowManager.js';
import { record } from '../store/ActivityStore.js';

type AgentEnv = { Variables: { agentAddress: string; agentPublicKey: string } };

export const agentRoutes = new Hono<AgentEnv>();

function requireChainReady(c: Context): Response | null {
    const missing = getMissingChainConfigKeys();
    if (missing.length === 0) return null;

    return c.json(
        { success: false, error: readinessErrorMessage(missing) },
        503,
    );
}

function requireWalletReady(c: Context): Response | null {
    const missing = getMissingWalletConfigKeys();
    if (missing.length === 0) return null;

    return c.json(
        { success: false, error: readinessErrorMessage(missing) },
        503,
    );
}

// POST /api/agent/register
agentRoutes.post('/register', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as { publicKey?: string; proof?: string; address?: string };
    const verifiedPublicKey = (c.get('agentPublicKey') as string | undefined) ?? '';

    if (!body.publicKey || !body.proof || !body.address) {
        return c.json({ success: false, error: 'publicKey, proof, and address are required' }, 400);
    }

    const cleanBodyKey = body.publicKey.startsWith('0x') ? body.publicKey.slice(2).toLowerCase() : body.publicKey.toLowerCase();
    const cleanVerifiedKey = verifiedPublicKey.startsWith('0x') ? verifiedPublicKey.slice(2).toLowerCase() : verifiedPublicKey.toLowerCase();
    if (cleanVerifiedKey && cleanBodyKey !== cleanVerifiedKey) {
        return c.json({ success: false, error: 'publicKey in body does not match signed header key' }, 403);
    }

    const agentAddress = normalizeAgentAddress(body.address);
    if (!isValidAgentAddress(agentAddress)) {
        return c.json({ success: false, error: 'Invalid address format (expected bech32 taproot address)' }, 400);
    }

    try {
        const txHash = await registerAgentOnChain(agentAddress);

        const response: AgentActionResponse = { txHash };
        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/deploy-collection
agentRoutes.post('/deploy-collection', async (c) => {
    const readinessError = requireWalletReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as DeployCollectionRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.address || !body.name || !body.symbol || !body.maxSupply) {
        return c.json(
            { success: false, error: 'address, name, symbol, and maxSupply are required' },
            400,
        );
    }

    const name = body.name.trim();
    const symbol = body.symbol.trim();
    if (!name || !symbol) {
        return c.json({ success: false, error: 'name and symbol cannot be empty' }, 400);
    }

    let maxSupply: bigint;
    try {
        maxSupply = BigInt(body.maxSupply);
    } catch {
        return c.json({ success: false, error: 'maxSupply must be a valid integer string' }, 400);
    }

    if (maxSupply <= 0n) {
        return c.json({ success: false, error: 'maxSupply must be greater than zero' }, 400);
    }

    try {
        const result = await deployCollection({
            address: body.address,
            name,
            symbol,
            maxSupply: body.maxSupply,
            baseURI: body.baseURI ?? '',
            collectionBanner: body.collectionBanner ?? '',
            collectionIcon: body.collectionIcon ?? '',
            collectionWebsite: body.collectionWebsite ?? '',
            collectionDescription: body.collectionDescription ?? '',
        });

        record({
            type: 'mint',
            agent: agentAddress,
            tokenId: '',
            nftName: name,
            txHash: result.deploymentTxHash,
        });

        return c.json({ success: true, data: result });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Deployment failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/mint
agentRoutes.post('/mint', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as MintRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.metadata?.name || !body.metadata?.description) {
        return c.json({ success: false, error: 'Metadata name and description are required' }, 400);
    }

    try {
        const recipient = body.recipient ?? agentAddress;
        const result = await mintNFT(recipient, {
            name: body.metadata.name,
            description: body.metadata.description,
            imageUrl: body.metadata.imageUrl ?? '',
            attributes: body.metadata.attributes ?? [],
        });

        record({
            type: 'mint',
            agent: agentAddress,
            tokenId: result.tokenId,
            nftName: body.metadata.name,
            txHash: result.txHash,
        });

        let response: AgentActionResponse = {
            txHash: result.txHash,
            tokenId: result.tokenId,
        };

        // If listImmediately, also list the NFT
        if (body.listImmediately && body.listPrice) {
            try {
                const listResult = await listNFT(result.tokenId, body.listPrice);
                record({
                    type: 'list',
                    agent: agentAddress,
                    tokenId: result.tokenId,
                    nftName: body.metadata.name,
                    listingId: listResult.listingId,
                    amount: body.listPrice,
                    txHash: listResult.txHash,
                });
                response = { ...response, listingId: listResult.listingId };
            } catch (listErr) {
                console.error('Auto-list after mint failed:', listErr);
            }
        }

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Mint failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/list
agentRoutes.post('/list', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as ListRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.tokenId || !body.price) {
        return c.json({ success: false, error: 'tokenId and price are required' }, 400);
    }

    if (BigInt(body.price) <= 0n) {
        return c.json({ success: false, error: 'Price must be greater than zero' }, 400);
    }

    try {
        const result = await listNFT(body.tokenId, body.price, body.auctionDuration ?? 0);

        record({
            type: 'list',
            agent: agentAddress,
            tokenId: body.tokenId,
            listingId: result.listingId,
            amount: body.price,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
            listingId: result.listingId,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'List failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/bid
agentRoutes.post('/bid', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as BidRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.listingId || !body.amount) {
        return c.json({ success: false, error: 'listingId and amount are required' }, 400);
    }

    try {
        const result = await placeBid(body.listingId, body.amount);

        record({
            type: 'bid',
            agent: agentAddress,
            listingId: body.listingId,
            amount: body.amount,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
            bidId: `bid-${Date.now().toString(36)}`,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bid failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/buy
agentRoutes.post('/buy', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as BuyRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.listingId) {
        return c.json({ success: false, error: 'listingId is required' }, 400);
    }

    try {
        // Lookup listing to get seller and price
        const listing = await getListingState(body.listingId);
        if (!listing) {
            return c.json({ success: false, error: 'Listing not found' }, 404);
        }
        if (listing.status !== 1) {
            return c.json({ success: false, error: 'Listing is not active' }, 400);
        }

        const result = await buyNow(body.listingId, listing.seller, listing.price);

        record({
            type: 'sale',
            agent: agentAddress,
            tokenId: listing.tokenId,
            listingId: body.listingId,
            amount: listing.price,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Buy failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/cancel
agentRoutes.post('/cancel', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as CancelRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.listingId) {
        return c.json({ success: false, error: 'listingId is required' }, 400);
    }

    try {
        const result = await cancelListing(body.listingId);

        record({
            type: 'cancel',
            agent: agentAddress,
            listingId: body.listingId,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cancel failed';
        return c.json({ success: false, error: msg }, 500);
    }
});
