import { env } from './env.js';

function hasValue(value: string | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

export function getMissingChainConfigKeys(): string[] {
    const missing: string[] = [];

    if (!hasValue(env.walletMnemonic)) {
        missing.push('WALLET_MNEMONIC');
    }
    if (!hasValue(env.contracts.marketplace)) {
        missing.push('MARKETPLACE_CONTRACT_ADDRESS');
    }

    return missing;
}

export function getMissingNftConfigKeys(): string[] {
    const missing: string[] = [];

    if (!hasValue(env.walletMnemonic)) {
        missing.push('WALLET_MNEMONIC');
    }

    return missing;
}

export function getMissingHubConfigKeys(): string[] {
    const missing = getMissingNftConfigKeys();

    if (!hasValue(env.contracts.nftHub)) {
        missing.push('NFT_HUB_CONTRACT_ADDRESS');
    }

    return missing;
}

export function getMissingWalletConfigKeys(): string[] {
    const missing: string[] = [];

    if (!hasValue(env.walletMnemonic)) {
        missing.push('WALLET_MNEMONIC');
    }

    return missing;
}

export function readinessErrorMessage(missingKeys: readonly string[]): string {
    return `Backend not configured for on-chain operations. Missing: ${missingKeys.join(', ')}. Configure missing env vars and restart backend.`;
}
