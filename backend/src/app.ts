import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { env } from './config/env.js';
import { publicRoutes } from './routes/public.routes.js';
import { agentRoutes } from './routes/agent.routes.js';
import { marketRoutes } from './routes/market.routes.js';
import { nftRoutes } from './routes/nft.routes.js';
import { agentAuth } from './middleware/agentAuth.js';
import { rateLimit } from './middleware/rateLimit.js';

const app = new Hono();

// ── Global middleware ──
app.use('*', cors());
app.use('*', logger());

// ── Health check ──
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        network: env.network,
        timestamp: new Date().toISOString(),
    });
});

// ── Public routes (no auth) ──
app.route('/api/public', publicRoutes);

// ── Agent routes (ML-DSA auth + rate limiting) ──
app.use('/api/agent/*', agentAuth);
app.use('/api/agent/*', rateLimit);
app.route('/api/agent', agentRoutes);

// ── Market routes (internal service routes) ──
app.route('/api/market', marketRoutes);

// ── NFT routes (internal service routes) ──
app.route('/api/nft', nftRoutes);

// ── 404 fallback ──
app.notFound((c) => {
    return c.json({ success: false, error: 'Not found' }, 404);
});

// ── Error handler ──
app.onError((err, c) => {
    console.error('Unhandled error:', err);
    return c.json(
        { success: false, error: err.message ?? 'Internal server error' },
        500,
    );
});

export default app;
