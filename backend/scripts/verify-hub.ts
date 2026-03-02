/**
 * verify-hub.ts
 *
 * Verify the NFTHub contract is deployed and callable.
 * Tries: getCollectionCount(), getAgentCount()
 *
 * Usage: tsx scripts/verify-hub.ts
 */

import 'dotenv/config';
import { networks } from '@btc-vision/bitcoin';
import { Mnemonic } from '@btc-vision/transaction';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

type DeployNetwork = 'regtest' | 'testnet' | 'mainnet';

const NETWORK_NAME = (process.env.OPNET_NETWORK ?? 'testnet') as DeployNetwork;
const NETWORK_MAP = {
    regtest: networks.regtest,
    testnet: networks.opnetTestnet,
    mainnet: networks.bitcoin,
} as const;

const RPC_URL_MAP = {
    regtest: process.env.OPNET_RPC_URL_REGTEST ?? 'https://regtest.opnet.org',
    testnet: process.env.OPNET_RPC_URL_TESTNET ?? 'https://testnet.opnet.org',
    mainnet: process.env.OPNET_RPC_URL_MAINNET ?? 'https://mainnet.opnet.org',
} as const;

const network = NETWORK_MAP[NETWORK_NAME];
const RPC_URL = RPC_URL_MAP[NETWORK_NAME];
const HUB_ADDRESS = process.env.NFT_HUB_CONTRACT_ADDRESS;

if (!HUB_ADDRESS) {
    console.error('ERROR: NFT_HUB_CONTRACT_ADDRESS not set in .env');
    process.exit(1);
}

const MNEMONIC = process.env.WALLET_MNEMONIC;
if (!MNEMONIC) {
    console.error('ERROR: WALLET_MNEMONIC env var is required');
    process.exit(1);
}

const F = BitcoinAbiTypes.Function;

const HUB_ABI: BitcoinInterfaceAbi = [
    {
        name: 'getCollectionCount',
        type: F,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'getAgentCount',
        type: F,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    },
];

async function main(): Promise<void> {
    console.log(`Network: ${NETWORK_NAME}`);
    console.log(`RPC URL: ${RPC_URL}`);
    console.log(`Hub address: ${HUB_ADDRESS}`);

    const mnemonic = new Mnemonic(MNEMONIC!, '', network);
    const wallet = mnemonic.deriveOPWallet();
    console.log(`Wallet: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network });

    try {
        // Step 1: Check if contract code exists
        console.log('\n--- Step 1: getCode ---');
        try {
            const code = await provider.getCode(HUB_ADDRESS, false);
            console.log(`Contract code found: ${JSON.stringify(code).slice(0, 200)}...`);
        } catch (err) {
            console.error(`getCode failed: ${err instanceof Error ? err.message : err}`);
        }

        // Step 2: Check balance
        console.log('\n--- Step 2: Wallet balance ---');
        const balance = await provider.getBalance(wallet.p2tr, true);
        console.log(`Balance: ${balance} sats`);

        // Step 3: Try to get contract and call methods
        console.log('\n--- Step 3: Contract call ---');
        try {
            const contract = getContract(
                HUB_ADDRESS,
                HUB_ABI,
                provider,
                network,
            );

            console.log('Contract instance created. Calling getCollectionCount()...');
            const countResult = await (contract as any).getCollectionCount();
            console.log('getCollectionCount result:', JSON.stringify(countResult?.decoded ?? countResult, null, 2));

            console.log('Calling getAgentCount()...');
            const agentResult = await (contract as any).getAgentCount();
            console.log('getAgentCount result:', JSON.stringify(agentResult?.decoded ?? agentResult, null, 2));

            console.log('\n========================================');
            console.log('  Hub contract is LIVE and CALLABLE!');
            console.log('========================================');
        } catch (err) {
            console.error(`Contract call failed: ${err instanceof Error ? err.message : err}`);
            console.error('\nThe contract may not be finalized yet or deployment failed.');
        }
    } finally {
        if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
        if (typeof wallet.zeroize === 'function') wallet.zeroize();
        await provider.close();
    }
}

main().catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
});
