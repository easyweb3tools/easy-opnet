import { serve } from '@hono/node-server';
import { env } from './config/env.js';
import app from './app.js';

// ── Start server (Node.js) ──
console.log(`AgentVault backend starting on port ${env.port} (${env.network})...`);

serve({
    fetch: app.fetch,
    port: env.port,
});

console.log(`AgentVault backend running at http://localhost:${env.port}`);
