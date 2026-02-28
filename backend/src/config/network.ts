import { networks, type Network } from '@btc-vision/bitcoin';
import type { NetworkName } from './env.js';

/**
 * CRITICAL: OPNet testnet uses networks.opnetTestnet (Signet fork).
 * NEVER use networks.testnet — that is Testnet4, which OPNet does NOT support.
 */
export const NETWORK_MAP: Record<NetworkName, Network> = {
    regtest: networks.regtest,
    testnet: networks.opnetTestnet, // CRITICAL: NOT networks.testnet
    mainnet: networks.bitcoin,
};

export function getNetwork(name: NetworkName): Network {
    return NETWORK_MAP[name];
}
