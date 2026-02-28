import type { Context, Next } from 'hono';
import { verifyAgentSignature } from '../agents/AgentAuthService.js';
import { isValidAgentAddress, normalizeAgentAddress } from '../agents/AddressValidator.js';

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

    let claimedAddress: string | null = null;
    try {
        const parsed = JSON.parse(body) as { address?: unknown; agentAddress?: unknown };
        const rawAddress = typeof parsed.address === 'string'
            ? parsed.address
            : typeof parsed.agentAddress === 'string'
                ? parsed.agentAddress
                : null;
        if (rawAddress) {
            claimedAddress = normalizeAgentAddress(rawAddress);
        }
    } catch {
        // Non-JSON bodies are still allowed for signature verification.
    }

    const headerAddress = c.req.header('X-Agent-Address');
    const normalizedHeaderAddress = headerAddress ? normalizeAgentAddress(headerAddress) : null;
    const resolvedAddress = claimedAddress ?? normalizedHeaderAddress;

    if (!resolvedAddress) {
        return c.json(
            { success: false, error: 'Missing agent address (provide body.address or X-Agent-Address)' },
            400,
        );
    }

    if (resolvedAddress && !isValidAgentAddress(resolvedAddress)) {
        return c.json(
            { success: false, error: 'Invalid agent address format (expected bech32 taproot address)' },
            400,
        );
    }

    // Store verified identity on context
    c.set('agentAddress', resolvedAddress);
    c.set('agentPublicKey', verification.normalizedPublicKey ?? publicKey);

    await next();
}
