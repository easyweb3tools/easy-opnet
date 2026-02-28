import { Hono } from 'hono';
import type { AgentActionResponse, MintRequest, ListRequest, BidRequest, BuyRequest, CancelRequest } from '../types/index.js';
import { registerAgentOnChain } from '../agents/AgentRegistry.js';
import { mintNFT } from '../nft/MintService.js';
import { listNFT, buyNow, placeBid, cancelListing } from '../market/MarketService.js';
import { getListingState } from '../market/EscrowManager.js';
import { record } from '../store/ActivityStore.js';

type AgentEnv = { Variables: { agentAddress: string } };

export const agentRoutes = new Hono<AgentEnv>();

// POST /api/agent/register
agentRoutes.post('/register', async (c) => {
    const _body = await c.req.json() as { publicKey: string; proof: string };
    const agentAddress = c.get('agentAddress');

    try {
        const txHash = await registerAgentOnChain(agentAddress);

        const response: AgentActionResponse = { txHash };
        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/mint
agentRoutes.post('/mint', async (c) => {
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
