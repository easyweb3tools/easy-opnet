import { Hono } from 'hono';
import * as MarketService from '../market/MarketService.js';
import { getMissingChainConfigKeys, readinessErrorMessage } from '../config/readiness.js';

export const marketRoutes = new Hono();

function chainReadinessError() {
    const missing = getMissingChainConfigKeys();
    if (missing.length === 0) return null;
    return {
        success: false,
        error: readinessErrorMessage(missing),
    } as const;
}

// POST /api/market/list — delegates to MarketService
marketRoutes.post('/list', async (c) => {
    const readiness = chainReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const body = await c.req.json() as { tokenId: string; price: string; auctionDuration?: number };

        if (!body.tokenId || !body.price) {
            return c.json({ success: false, error: 'tokenId and price are required' }, 400);
        }

        const result = await MarketService.listNFT(
            body.tokenId,
            body.price,
            body.auctionDuration ?? 0,
        );

        return c.json({ success: true, data: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});

// POST /api/market/buy — delegates to MarketService
marketRoutes.post('/buy', async (c) => {
    const readiness = chainReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const body = await c.req.json() as { listingId: string; sellerAddress: string; price: string };

        if (!body.listingId || !body.sellerAddress || !body.price) {
            return c.json({ success: false, error: 'listingId, sellerAddress, and price are required' }, 400);
        }

        const result = await MarketService.buyNow(
            body.listingId,
            body.sellerAddress,
            body.price,
        );

        return c.json({ success: true, data: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});

// POST /api/market/bid — delegates to MarketService
marketRoutes.post('/bid', async (c) => {
    const readiness = chainReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const body = await c.req.json() as { listingId: string; amount: string };

        if (!body.listingId || !body.amount) {
            return c.json({ success: false, error: 'listingId and amount are required' }, 400);
        }

        const result = await MarketService.placeBid(body.listingId, body.amount);

        return c.json({ success: true, data: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});

// POST /api/market/cancel — delegates to MarketService
marketRoutes.post('/cancel', async (c) => {
    const readiness = chainReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const body = await c.req.json() as { listingId: string };

        if (!body.listingId) {
            return c.json({ success: false, error: 'listingId is required' }, 400);
        }

        const result = await MarketService.cancelListing(body.listingId);

        return c.json({ success: true, data: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});
