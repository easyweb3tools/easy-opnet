import 'dotenv/config';

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

function optionalEnv(key: string, defaultValue: string): string {
    return process.env[key] ?? defaultValue;
}

export type NetworkName = 'regtest' | 'testnet' | 'mainnet';

function parseNetwork(raw: string): NetworkName {
    if (raw === 'regtest' || raw === 'testnet' || raw === 'mainnet') {
        return raw;
    }
    throw new Error(`Invalid OPNET_NETWORK: ${raw}. Must be regtest, testnet, or mainnet`);
}

export const env = {
    network: parseNetwork(optionalEnv('OPNET_NETWORK', 'testnet')),

    rpcUrls: {
        regtest: optionalEnv('OPNET_RPC_URL_REGTEST', 'https://regtest.opnet.org'),
        testnet: optionalEnv('OPNET_RPC_URL_TESTNET', 'https://testnet.opnet.org'),
        mainnet: optionalEnv('OPNET_RPC_URL_MAINNET', 'https://mainnet.opnet.org'),
    } as Record<NetworkName, string>,

    contracts: {
        marketplace: optionalEnv('MARKETPLACE_CONTRACT_ADDRESS', ''),
        nftHub: optionalEnv('NFT_HUB_CONTRACT_ADDRESS', ''),
    },

    walletMnemonic: optionalEnv('WALLET_MNEMONIC', ''),
    pinataJwt: optionalEnv('PINATA_JWT', ''),
    port: parseInt(optionalEnv('PORT', '3001'), 10),
} as const;
