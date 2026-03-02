import { env } from './env.js';

export const CONTRACT_ADDRESSES = {
    marketplace: env.contracts.marketplace,
    nftHub: env.contracts.nftHub,
} as const;
