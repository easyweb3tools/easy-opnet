/**
 * deploy-contracts.ts
 *
 * Deploys MyNFT contract to OPNet.
 * Uses parameterized deployment calldata matching MyNFT.onDeployment().
 *
 * Usage: tsx scripts/deploy-contracts.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { networks } from '@btc-vision/bitcoin';
import {
    BinaryWriter,
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

const NFT_WASM = path.resolve(__dirname, '../contracts/MyNFT.wasm');
const MIN_RECOMMENDED_BALANCE = 200_000n;

const DEFAULT_COLLECTION = {
    name: process.env.DEPLOY_COLLECTION_NAME ?? 'Easy Web3 Tools',
    symbol: process.env.DEPLOY_COLLECTION_SYMBOL ?? 'EASY',
    maxSupply: process.env.DEPLOY_COLLECTION_MAX_SUPPLY ?? '10000',
    baseURI: process.env.DEPLOY_COLLECTION_BASE_URI ?? 'https://img.easyweb3.tools/easyweb3.jpg',
    collectionBanner: process.env.DEPLOY_COLLECTION_BANNER ?? 'https://img.easyweb3.tools/easyweb3.jpg',
    collectionIcon: process.env.DEPLOY_COLLECTION_ICON ?? 'https://img.easyweb3.tools/easyweb3.jpg',
    collectionWebsite: process.env.DEPLOY_COLLECTION_WEBSITE ?? 'https://www.easyweb3.tools',
    collectionDescription: process.env.DEPLOY_COLLECTION_DESCRIPTION ?? 'AI-Native NFT Marketplace on OPNet!',
} as const;

function buildDeploymentCalldata(maxSupply: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeStringWithLength(DEFAULT_COLLECTION.name);
    writer.writeStringWithLength(DEFAULT_COLLECTION.symbol);
    writer.writeU256(maxSupply);
    writer.writeStringWithLength(DEFAULT_COLLECTION.baseURI);
    writer.writeStringWithLength(DEFAULT_COLLECTION.collectionBanner);
    writer.writeStringWithLength(DEFAULT_COLLECTION.collectionIcon);
    writer.writeStringWithLength(DEFAULT_COLLECTION.collectionWebsite);
    writer.writeStringWithLength(DEFAULT_COLLECTION.collectionDescription);

    return new Uint8Array(writer.getBuffer());
}

function parseMaxSupply(raw: string): bigint {
    let maxSupply: bigint;
    try {
        maxSupply = BigInt(raw);
    } catch {
        throw new Error(`Invalid DEPLOY_COLLECTION_MAX_SUPPLY: "${raw}"`);
    }

    if (maxSupply <= 0n) {
        throw new Error('DEPLOY_COLLECTION_MAX_SUPPLY must be greater than zero');
    }

    return maxSupply;
}

async function main(): Promise<void> {
    if (!fs.existsSync(NFT_WASM)) {
        console.error(`MyNFT WASM not found at ${NFT_WASM}`);
        console.error('Run: cd contracts && npm run build:nft:copy');
        process.exit(1);
    }

    const maxSupply = parseMaxSupply(DEFAULT_COLLECTION.maxSupply);

    console.log('Initializing wallet...');
    const mnemonic = new Mnemonic(MNEMONIC, '', network);
    const wallet = mnemonic.derive(0);
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
        const bytecode = new Uint8Array(fs.readFileSync(NFT_WASM));
        const calldata = buildDeploymentCalldata(maxSupply);

        console.log('\n--- Deploying MyNFT ---');
        console.log(`Bytecode size: ${bytecode.length} bytes`);
        console.log(`Calldata size: ${calldata.length} bytes`);

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
            priorityFee: 330n,
            gasSatFee: 330n,
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
        console.log('  Deployment Complete');
        console.log('========================================');
        console.log(`deployed_collection_contract=${deployResult.contractAddress}`);
        console.log('\nStore this address in your collections database.');
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
