import { JSONRpcProvider } from 'opnet';
import { env } from '../config/env.js';
import { getNetwork } from '../config/network.js';

let provider: JSONRpcProvider | null = null;

export function getProvider(): JSONRpcProvider {
    if (!provider) {
        const networkName = env.network;
        const rpcUrl = env.rpcUrls[networkName];
        const network = getNetwork(networkName);

        provider = new JSONRpcProvider({
            url: rpcUrl,
            network,
        });
    }
    return provider;
}

export function getRpcUrl(): string {
    return env.rpcUrls[env.network];
}

export async function closeProvider(): Promise<void> {
    if (provider) {
        await provider.close();
        provider = null;
    }
}
