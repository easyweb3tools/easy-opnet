const TAPROOT_ADDRESS_PATTERN = /^(bc|tb|bcrt|opt)1p[023456789acdefghjklmnpqrstuvwxyz]{8,}$/;

export function normalizeAgentAddress(address: string): string {
    return address.trim().toLowerCase();
}

export function isValidAgentAddress(address: string): boolean {
    const normalized = normalizeAgentAddress(address);
    if (!normalized) return false;

    return TAPROOT_ADDRESS_PATTERN.test(normalized);
}
