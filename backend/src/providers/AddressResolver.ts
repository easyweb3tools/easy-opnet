import { fromHex, toHex, toXOnly } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { getProvider } from './ProviderManager.js';

const addressCache = new Map<string, Promise<Address>>();
const publicKeyByAddress = new Map<string, string>();

function cacheKey(address: string, isContract: boolean): string {
    return `${isContract ? 'contract' : 'wallet'}:${address.trim().toLowerCase()}`;
}

export async function resolveAddress(address: string, isContract: boolean = false): Promise<Address> {
    return resolveAddressWithPublicKey(address, isContract);
}

export async function resolveAddressWithPublicKey(
    address: string,
    isContract: boolean = false,
    publicKeyHint?: string,
): Promise<Address> {
    const normalized = address.trim().toLowerCase();
    if (!normalized) {
        throw new Error('Address is required');
    }

    if (publicKeyHint) {
        rememberAddressPublicKey(normalized, publicKeyHint);
    }

    const key = cacheKey(normalized, isContract);
    const cached = addressCache.get(key);
    if (cached) {
        return cached;
    }

    const rememberedPublicKey = publicKeyByAddress.get(normalized);
    if (rememberedPublicKey) {
        const resolved = Promise.resolve(addressFromPublicKey(rememberedPublicKey));
        addressCache.set(key, resolved);
        return resolved;
    }

    const pending = resolveAddressWithFallback(normalized, isContract).catch((error) => {
        addressCache.delete(key);
        throw error;
    });

    addressCache.set(key, pending);
    return pending;
}

export async function setContractSender(contract: unknown, senderAddress: string): Promise<void> {
    const contractWithSender = contract as { setSender?: (sender: Address) => void };
    if (typeof contractWithSender.setSender !== 'function') {
        return;
    }

    // Sender can be a standard p2tr address without ML-DSA hash indexed.
    const sender = await resolveAddress(senderAddress, true);
    contractWithSender.setSender(sender);
}

export function rememberAddressPublicKey(address: string, publicKey: string): void {
    const normalizedAddress = address.trim().toLowerCase();
    if (!normalizedAddress) return;

    const normalizedPublicKey = normalizePublicKey(publicKey);
    publicKeyByAddress.set(normalizedAddress, normalizedPublicKey);
    addressCache.delete(cacheKey(normalizedAddress, false));
    addressCache.delete(cacheKey(normalizedAddress, true));
}

export function getRememberedAddressPublicKey(address: string): string | null {
    return publicKeyByAddress.get(address.trim().toLowerCase()) ?? null;
}

async function resolveAddressWithFallback(normalized: string, isContract: boolean): Promise<Address> {
    const provider = getProvider();

    try {
        return await provider.getPublicKeyInfo(normalized, isContract);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
            !message.includes('No valid address content found')
            && !message.includes('No public key information found')
        ) {
            throw error;
        }

        const raw = await provider.getPublicKeysInfoRaw(normalized);
        const normalizedHex = normalized.startsWith('0x') ? normalized.slice(2) : normalized;
        const entry = raw[normalized] ?? raw[normalizedHex];

        if (!entry || typeof entry !== 'object') {
            throw error;
        }

        if ('error' in entry) {
            throw new Error(
                `Failed to resolve address ${normalized}: ${String((entry as { error?: unknown }).error ?? 'unknown error')}`,
            );
        }

        const info = entry as Record<string, unknown>;
        const mldsaHashedPublicKey = asString(info.mldsaHashedPublicKey);
        const tweakedPubkey = asString(info.tweakedPubkey);
        const originalPubKey = asString(info.originalPubKey);

        const addressContent = mldsaHashedPublicKey ?? tweakedPubkey ?? originalPubKey;
        const legacyKey = originalPubKey ?? tweakedPubkey;

        if (!addressContent) {
            throw error;
        }

        rememberAddressPublicKey(normalized, addressContent);
        return Address.fromString(addressContent, legacyKey);
    }
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizePublicKey(value: string): string {
    const clean = value.startsWith('0x') ? value.slice(2) : value;
    const normalized = clean.toLowerCase().trim();
    if (!/^[0-9a-f]+$/.test(normalized)) {
        throw new Error('Public key must be a hex string');
    }
    if (normalized.length % 2 !== 0) {
        throw new Error('Public key hex length must be even');
    }

    if (normalized.length === 66 || normalized.length === 130) {
        const publicKey = fromHex(normalized) as unknown as Parameters<typeof toXOnly>[0];
        return toHex(toXOnly(publicKey)).toLowerCase();
    }

    return normalized;
}

function addressFromPublicKey(publicKey: string): Address {
    const normalized = normalizePublicKey(publicKey);

    if (normalized.length === 64) {
        // 32-byte contract/public key material must not be forced into legacy key path.
        // For contract deployments, this is the canonical seed/public key form.
        return Address.fromString(normalized);
    }

    // ML-DSA public keys (LEVEL2/3/5).
    if (normalized.length === 2624 || normalized.length === 3904 || normalized.length === 5184) {
        return Address.fromString(normalized);
    }

    throw new Error(
        `Unsupported public key length: ${normalized.length} hex chars. `
        + 'Expected x-only 64 hex chars or ML-DSA 2624/3904/5184 hex chars.',
    );
}
