let runtimeBindings: Record<string, unknown> | null = null;

export function setRuntimeBindings(bindings: Record<string, unknown>): void {
    runtimeBindings = bindings;
}

export function getRuntimeBinding<T>(key: string): T | null {
    if (!runtimeBindings) return null;
    if (!(key in runtimeBindings)) return null;
    return runtimeBindings[key] as T;
}

export function getD1Database(): D1Database | null {
    const db = getRuntimeBinding<unknown>('DB');
    if (!db || typeof db !== 'object') return null;
    if (typeof (db as D1Database).prepare !== 'function') return null;
    return db as D1Database;
}
