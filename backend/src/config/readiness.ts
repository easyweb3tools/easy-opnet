import { env } from './env.js';

function hasValue(value: string | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

export function getMissingChainConfigKeys(): string[] {
    const missing: string[] = [];

    if (!hasValue(env.walletMnemonic)) {
        missing.push('WALLET_MNEMONIC');
    }
    if (!hasValue(env.contracts.nft)) {
        missing.push('NFT_CONTRACT_ADDRESS');
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
    if (!hasValue(env.contracts.nft)) {
        missing.push('NFT_CONTRACT_ADDRESS');
    }

    return missing;
}

export function readinessErrorMessage(missingKeys: readonly string[]): string {
    return `Backend not configured for on-chain operations. Missing: ${missingKeys.join(', ')}. Deploy contracts (npm run deploy:contracts), then set missing env vars and restart backend.`;
}
