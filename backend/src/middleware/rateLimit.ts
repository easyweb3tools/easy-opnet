import type { Context, Next } from 'hono';

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30; // per agent per window

interface RateEntry {
    count: number;
    resetAt: number;
}

const rateLimits = new Map<string, RateEntry>();

// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimits) {
        if (entry.resetAt <= now) {
            rateLimits.delete(key);
        }
    }
}, WINDOW_MS);

export async function rateLimit(c: Context, next: Next): Promise<Response | void> {
    const agentKey = (c.get('agentPublicKey') as string | undefined) ?? c.req.header('X-Agent-PublicKey') ?? 'anonymous';
    const now = Date.now();

    let entry = rateLimits.get(agentKey);
    if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + WINDOW_MS };
        rateLimits.set(agentKey, entry);
    }

    entry.count++;

    if (entry.count > MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        return c.json(
            { success: false, error: 'Rate limit exceeded. Try again later.' },
            429,
        );
    }

    await next();
}
