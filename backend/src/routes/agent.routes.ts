import { Hono } from 'hono';
import type { AgentActionResponse, MintRequest, ListRequest, BidRequest, BuyRequest, CancelRequest } from '../types/index.js';

type AgentEnv = { Variables: { agentAddress: string } };

export const agentRoutes = new Hono<AgentEnv>();

// POST /api/agent/register
agentRoutes.post('/register', async (c) => {
    const _body = await c.req.json() as { publicKey: string; proof: string };
    const _agentAddress = c.get('agentAddress');

    // TODO: Wire to AgentRegistry.registerAgentOnChain()
    const response: AgentActionResponse = {
        txHash: `0x${Date.now().toString(16)}`,
    };

    return c.json({ success: true, data: response });
});

// POST /api/agent/mint
agentRoutes.post('/mint', async (c) => {
    const body = await c.req.json() as MintRequest;
    const _agentAddress = c.get('agentAddress');

    if (!body.metadata?.name || !body.metadata?.description) {
        return c.json({ success: false, error: 'Metadata name and description are required' }, 400);
    }

    // TODO: Wire to MintService.mintNFT()
    const response: AgentActionResponse = {
        txHash: `0x${Date.now().toString(16)}`,
        tokenId: String(Math.floor(Math.random() * 10000)),
    };

    return c.json({ success: true, data: response });
});

// POST /api/agent/list
agentRoutes.post('/list', async (c) => {
    const body = await c.req.json() as ListRequest;
    const _agentAddress = c.get('agentAddress');

    if (!body.tokenId || !body.price) {
        return c.json({ success: false, error: 'tokenId and price are required' }, 400);
    }

    if (BigInt(body.price) <= 0n) {
        return c.json({ success: false, error: 'Price must be greater than zero' }, 400);
    }

    // TODO: Wire to MarketService.listNFT()
    const response: AgentActionResponse = {
        txHash: `0x${Date.now().toString(16)}`,
        listingId: `listing-${Date.now().toString(36)}`,
    };

    return c.json({ success: true, data: response });
});

// POST /api/agent/bid
agentRoutes.post('/bid', async (c) => {
    const body = await c.req.json() as BidRequest;
    const _agentAddress = c.get('agentAddress');

    if (!body.listingId || !body.amount) {
        return c.json({ success: false, error: 'listingId and amount are required' }, 400);
    }

    // TODO: Wire to MarketService.placeBid()
    const response: AgentActionResponse = {
        txHash: `0x${Date.now().toString(16)}`,
        bidId: `bid-${Date.now().toString(36)}`,
    };

    return c.json({ success: true, data: response });
});

// POST /api/agent/buy
agentRoutes.post('/buy', async (c) => {
    const body = await c.req.json() as BuyRequest;
    const _agentAddress = c.get('agentAddress');

    if (!body.listingId) {
        return c.json({ success: false, error: 'listingId is required' }, 400);
    }

    // TODO: Wire to MarketService.buyNow()
    const response: AgentActionResponse = {
        txHash: `0x${Date.now().toString(16)}`,
    };

    return c.json({ success: true, data: response });
});

// POST /api/agent/cancel
agentRoutes.post('/cancel', async (c) => {
    const body = await c.req.json() as CancelRequest;
    const _agentAddress = c.get('agentAddress');

    if (!body.listingId) {
        return c.json({ success: false, error: 'listingId is required' }, 400);
    }

    // TODO: Wire to MarketService.cancelListing()
    const response: AgentActionResponse = {
        txHash: `0x${Date.now().toString(16)}`,
    };

    return c.json({ success: true, data: response });
});
