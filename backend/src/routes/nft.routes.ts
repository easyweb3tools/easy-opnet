import { Hono } from 'hono';
import { mintNFT } from '../nft/MintService.js';
import { getTokenOwner, getTokenURI, getBalanceOf } from '../nft/TokenIndexer.js';
import { getMissingNftConfigKeys, readinessErrorMessage } from '../config/readiness.js';

export const nftRoutes = new Hono();

function nftReadinessError() {
    const missing = getMissingNftConfigKeys();
    if (missing.length === 0) return null;
    return {
        success: false,
        error: readinessErrorMessage(missing),
    } as const;
}

// POST /api/nft/mint — delegates to MintService
nftRoutes.post('/mint', async (c) => {
    const readiness = nftReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const body = await c.req.json() as {
            nftContractAddress: string;
            to: string;
            metadata: {
                name: string;
                description: string;
                imageUrl: string;
                attributes: Array<{ traitType: string; value: string }>;
            };
        };

        if (!body.nftContractAddress || !body.to || !body.metadata?.name) {
            return c.json({ success: false, error: 'nftContractAddress, to address and metadata.name are required' }, 400);
        }

        const result = await mintNFT(body.nftContractAddress, body.to, body.metadata);

        return c.json({ success: true, data: result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});

// GET /api/nft/owner/:tokenId — reads owner from chain
nftRoutes.get('/owner/:tokenId', async (c) => {
    const readiness = nftReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const tokenId = c.req.param('tokenId');
        const nftContractAddress = c.req.query('contract');
        if (!nftContractAddress) {
            return c.json({ success: false, error: 'contract query parameter is required' }, 400);
        }

        const owner = await getTokenOwner(tokenId, nftContractAddress);

        if (!owner) {
            return c.json({ success: false, error: 'Token not found' }, 404);
        }

        return c.json({ success: true, data: { tokenId, owner } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});

// GET /api/nft/uri/:tokenId — reads tokenURI from chain
nftRoutes.get('/uri/:tokenId', async (c) => {
    const readiness = nftReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const tokenId = c.req.param('tokenId');
        const nftContractAddress = c.req.query('contract');
        if (!nftContractAddress) {
            return c.json({ success: false, error: 'contract query parameter is required' }, 400);
        }

        const uri = await getTokenURI(tokenId, nftContractAddress);

        if (!uri) {
            return c.json({ success: false, error: 'Token not found' }, 404);
        }

        return c.json({ success: true, data: { tokenId, uri } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});

// GET /api/nft/balance/:address — reads balance from chain
nftRoutes.get('/balance/:address', async (c) => {
    const readiness = nftReadinessError();
    if (readiness) return c.json(readiness, 503);

    try {
        const address = c.req.param('address');
        const nftContractAddress = c.req.query('contract');
        if (!nftContractAddress) {
            return c.json({ success: false, error: 'contract query parameter is required' }, 400);
        }

        const balance = await getBalanceOf(address, nftContractAddress);

        return c.json({ success: true, data: { address, balance: balance.toString() } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ success: false, error: message }, 500);
    }
});
