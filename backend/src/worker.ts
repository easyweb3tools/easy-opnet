/**
 * Cloudflare Workers entry point.
 *
 * Bridges CF Worker bindings → process.env so that the existing
 * env.ts config module works without changes.
 */

let appLoaded: typeof import('./app.js') | null = null;

export default {
    async fetch(
        request: Request,
        cfEnv: Record<string, unknown>,
        ctx: ExecutionContext,
    ): Promise<Response> {
        // Bridge CF bindings to process.env (only strings)
        for (const [key, value] of Object.entries(cfEnv)) {
            if (typeof value === 'string') {
                process.env[key] = value;
            }
        }

        // Lazy-import app so process.env is populated before env.ts evaluates
        if (!appLoaded) {
            appLoaded = await import('./app.js');
        }

        return appLoaded.default.fetch(request, cfEnv, ctx);
    },
};
