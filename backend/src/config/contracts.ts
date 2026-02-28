import { env } from './env.js';

export const CONTRACT_ADDRESSES = {
    nft: env.contracts.nft,
    marketplace: env.contracts.marketplace,
} as const;
