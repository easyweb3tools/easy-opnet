import { env } from './env.js';

export const CONTRACT_ADDRESSES = {
    marketplace: env.contracts.marketplace,
} as const;
