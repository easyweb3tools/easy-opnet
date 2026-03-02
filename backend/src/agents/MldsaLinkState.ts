import { toHex } from '@btc-vision/bitcoin';
import { MessageSigner } from '@btc-vision/transaction';
import type { JSONRpcProvider } from 'opnet';
import { getAgentWallet } from './AgentWallet.js';

interface LinkState {
    readonly linkRequired: boolean;
    readonly walletMldsaHashHex: string;
}

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeAddress(value: string): string {
    return value.trim().toLowerCase();
}

function normalizeHex(value: string): string {
    return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

function normalizeEntry(
    raw: Record<string, unknown>,
    key: string,
): Record<string, unknown> | null {
    const normalizedKey = key.toLowerCase();
    const keyWithout0x = normalizedKey.startsWith('0x') ? normalizedKey.slice(2) : normalizedKey;
    const entry = raw[key] ?? raw[normalizedKey] ?? raw[keyWithout0x];
    return asObject(entry);
}

export async function resolveWalletMldsaLinkState(
    provider: JSONRpcProvider,
): Promise<LinkState> {
    const wallet = getAgentWallet() as unknown as {
        readonly p2tr: string;
        readonly mldsaKeypair: { readonly publicKey: Uint8Array };
    };

    const walletAddress = normalizeAddress(wallet.p2tr);
    const walletMldsaHashHex = toHex(
        MessageSigner.sha256(wallet.mldsaKeypair.publicKey),
    ).toLowerCase();

    // 1) Resolve by wallet address: if already linked, verify it matches current mnemonic key.
    const byAddressRaw = await provider.getPublicKeysInfoRaw(walletAddress);
    const byAddress = normalizeEntry(byAddressRaw as unknown as Record<string, unknown>, walletAddress);
    if (byAddress) {
        const linkedHash = asString(byAddress.mldsaHashedPublicKey);
        if (linkedHash) {
            const normalizedLinkedHash = normalizeHex(linkedHash);
            if (normalizedLinkedHash !== walletMldsaHashHex) {
                throw new Error(
                    `Backend wallet address ${walletAddress} is linked to ML-DSA hash `
                    + `${normalizedLinkedHash}, but WALLET_MNEMONIC derives hash ${walletMldsaHashHex}. `
                    + 'Use a mnemonic that matches the already-linked wallet pair.',
                );
            }

            return {
                linkRequired: false,
                walletMldsaHashHex,
            };
        }
    }

    // 2) Resolve by current mnemonic ML-DSA hash: if linked elsewhere, configuration is invalid.
    const queryHash = `0x${walletMldsaHashHex}`;
    const byHashRaw = await provider.getPublicKeysInfoRaw(queryHash);
    const byHash = normalizeEntry(byHashRaw as unknown as Record<string, unknown>, queryHash);
    if (byHash) {
        const errorMessage = asString(byHash.error);
        if (!errorMessage) {
            const linkedP2tr = asString(byHash.p2tr);
            if (linkedP2tr) {
                const normalizedLinkedP2tr = normalizeAddress(linkedP2tr);
                if (normalizedLinkedP2tr !== walletAddress) {
                    throw new Error(
                        `WALLET_MNEMONIC derives legacy address ${walletAddress}, `
                        + `but its ML-DSA key hash ${walletMldsaHashHex} is already linked to `
                        + `${normalizedLinkedP2tr}. Use a matching mnemonic or a fresh wallet.`,
                    );
                }

                return {
                    linkRequired: false,
                    walletMldsaHashHex,
                };
            }
        }
    }

    return {
        linkRequired: true,
        walletMldsaHashHex,
    };
}
