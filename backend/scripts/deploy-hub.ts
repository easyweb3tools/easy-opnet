/**
 * deploy-hub.ts
 *
 * Deploys NFTHub contract to OPNet.
 * The Hub's onDeployment() takes no calldata — it initialises
 * collectionCount=0, globalNextTokenId=0, feeRecipient=tx.origin.
 *
 * Usage: tsx scripts/deploy-hub.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { networks } from '@btc-vision/bitcoin';
import {
    Mnemonic,
    OPNetLimitedProvider,
    TransactionFactory,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';

type DeployNetwork = 'regtest' | 'testnet' | 'mainnet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

if (!NETWORK_MAP[NETWORK_NAME]) {
    console.error(`ERROR: Unsupported OPNET_NETWORK=${NETWORK_NAME}`);
    process.exit(1);
}

const network = NETWORK_MAP[NETWORK_NAME];
const RPC_URL = RPC_URL_MAP[NETWORK_NAME];

const MNEMONIC = process.env.WALLET_MNEMONIC;
if (!MNEMONIC) {
    console.error('ERROR: WALLET_MNEMONIC env var is required');
    process.exit(1);
}

const HUB_WASM = path.resolve(__dirname, '../contracts/NFTHub.wasm');
const MIN_RECOMMENDED_BALANCE = 200_000n;

async function main(): Promise<void> {
    if (!fs.existsSync(HUB_WASM)) {
        console.error(`NFTHub WASM not found at ${HUB_WASM}`);
        console.error('Run: cd contracts && npm run build:hub:copy');
        process.exit(1);
    }

    console.log('Initializing wallet...');
    const mnemonic = new Mnemonic(MNEMONIC!, '', network);
    const wallet = mnemonic.deriveOPWallet();
    console.log(`Network: ${NETWORK_NAME}`);
    console.log(`RPC URL: ${RPC_URL}`);
    console.log(`Wallet address: ${wallet.p2tr}`);

    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network });

    try {
        const currentBalance = await jsonRpcProvider.getBalance(wallet.p2tr, true);
        console.log(`Wallet balance: ${currentBalance} sats`);
        if (currentBalance < MIN_RECOMMENDED_BALANCE) {
            throw new Error(
                `Insufficient balance for deployment. Need at least ${MIN_RECOMMENDED_BALANCE} sats, got ${currentBalance}. Fund ${wallet.p2tr} and retry.`,
            );
        }

        const challenge = await jsonRpcProvider.getChallenge();
        const bytecode = new Uint8Array(fs.readFileSync(HUB_WASM));

        // NFTHub.onDeployment() ignores calldata — send empty bytes.
        const calldata = new Uint8Array(0);

        console.log('\n--- Deploying NFTHub ---');
        console.log(`Bytecode size: ${bytecode.length} bytes`);

        const utxos = await limitedProvider.fetchUTXO({
            address: wallet.p2tr,
            minAmount: 10_000n,
            requestedAmount: 500_000n,
        });
        if (utxos.length === 0) {
            throw new Error(`No spendable UTXOs found for ${wallet.p2tr}. Fund wallet and retry.`);
        }
        console.log(`Found ${utxos.length} UTXOs for deployment`);

        const factory = new TransactionFactory();
        const deployResult = await factory.signDeployment({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            network,
            from: wallet.p2tr,
            bytecode,
            calldata,
            utxos,
            challenge,
            feeRate: 2,
            priorityFee: 10_000n,
            gasSatFee: 10_000n,
        });

        if (!deployResult.transaction || deployResult.transaction.length < 2) {
            throw new Error('Deployment signing returned incomplete transactions');
        }

        console.log(`Contract address: ${deployResult.contractAddress}`);

        const fundingBroadcast = await limitedProvider.broadcastTransaction(
            deployResult.transaction[0],
            false,
        );
        if (!fundingBroadcast?.success) {
            throw new Error('Failed to broadcast deployment funding transaction');
        }
        console.log(`Funding TX hash: ${fundingBroadcast.result ?? '(missing hash)'}`);

        const deploymentBroadcast = await limitedProvider.broadcastTransaction(
            deployResult.transaction[1],
            false,
        );
        if (!deploymentBroadcast?.success) {
            throw new Error('Failed to broadcast deployment transaction');
        }
        console.log(`Deployment TX hash: ${deploymentBroadcast.result ?? '(missing hash)'}`);

        console.log('\n========================================');
        console.log('  NFTHub Deployment Complete');
        console.log('========================================');
        console.log(`NFT_HUB_CONTRACT_ADDRESS=${deployResult.contractAddress}`);
        console.log('\nAdd this to your .env file.');
        console.log('========================================');
    } finally {
        if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
        if (typeof wallet.zeroize === 'function') wallet.zeroize();
        await jsonRpcProvider.close();
    }
}

main().catch((err) => {
    console.error('Deployment failed:', err);
    process.exit(1);
});
