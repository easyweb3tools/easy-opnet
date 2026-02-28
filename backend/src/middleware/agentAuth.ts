import type { Context, Next } from 'hono';
import { verifyAgentSignature } from '../agents/AgentAuthService.js';

/**
 * Middleware that extracts ML-DSA signature from headers and verifies the agent.
 * Sets `agentAddress` on the Hono context variables.
 */
export async function agentAuth(c: Context, next: Next): Promise<Response | void> {
    const signature = c.req.header('X-Agent-Signature');
    const publicKey = c.req.header('X-Agent-PublicKey');

    if (!signature || !publicKey) {
        return c.json(
            { success: false, error: 'Missing X-Agent-Signature or X-Agent-PublicKey headers' },
            401,
        );
    }

    // Read request body for signature verification
    const body = await c.req.text();

    const verification = await verifyAgentSignature(body, signature, publicKey);
    if (!verification.valid) {
        return c.json(
            { success: false, error: verification.error ?? 'Invalid agent signature' },
            403,
        );
    }

    // Store verified agent address on context
    c.set('agentAddress', verification.address);
    c.set('agentPublicKey', publicKey);

    await next();
}
