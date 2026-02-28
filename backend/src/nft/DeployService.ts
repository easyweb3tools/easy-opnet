import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    BinaryWriter,
    OPNetLimitedProvider,
    TransactionFactory,
} from '@btc-vision/transaction';
import { getAgentWallet } from '../agents/AgentWallet.js';
import { env } from '../config/env.js';
import { getNetwork } from '../config/network.js';
import { getProvider, getRpcUrl } from '../providers/ProviderManager.js';
import { saveCollection } from '../store/CollectionStore.js';
import type {
    DeployCollectionRequest,
    DeployCollectionResponse,
} from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NFT_WASM_PATH = path.resolve(__dirname, '../../contracts/MyNFT.wasm');

function parseMaxSupply(value: string): bigint {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error('maxSupply is required');
    }

    let parsed: bigint;
    try {
        parsed = BigInt(normalized);
    } catch {
        throw new Error('maxSupply must be a valid integer string');
    }

    if (parsed <= 0n) {
        throw new Error('maxSupply must be greater than zero');
    }

    return parsed;
}

export async function deployCollection(
    params: DeployCollectionRequest,
): Promise<DeployCollectionResponse> {
    if (!fs.existsSync(NFT_WASM_PATH)) {
        throw new Error('MyNFT.wasm not found. Run: cd contracts && npm run build:nft:copy');
    }

    const maxSupply = parseMaxSupply(params.maxSupply);

    const writer = new BinaryWriter();
    writer.writeStringWithLength(params.name);
    writer.writeStringWithLength(params.symbol);
    writer.writeU256(maxSupply);
    writer.writeStringWithLength(params.baseURI ?? '');
    writer.writeStringWithLength(params.collectionBanner ?? '');
    writer.writeStringWithLength(params.collectionIcon ?? '');
    writer.writeStringWithLength(params.collectionWebsite ?? '');
    writer.writeStringWithLength(params.collectionDescription ?? '');

    const calldata = new Uint8Array(writer.getBuffer());
    const bytecode = new Uint8Array(fs.readFileSync(NFT_WASM_PATH));

    const wallet = getAgentWallet();
    const network = getNetwork(env.network);
    const provider = getProvider();
    const rpcUrl = getRpcUrl();
    const limitedProvider = new OPNetLimitedProvider(rpcUrl);
    const challenge = await provider.getChallenge();

    const utxos = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 500_000n,
    });

    if (utxos.length === 0) {
        throw new Error(`No UTXOs available for deployment wallet ${wallet.p2tr}. Fund wallet first.`);
    }

    const factory = new TransactionFactory();
    type SignDeploymentArgs = Parameters<TransactionFactory['signDeployment']>[0];

    const result = await factory.signDeployment({
        signer: wallet.keypair as SignDeploymentArgs['signer'],
        mldsaSigner: wallet.mldsaKeypair as SignDeploymentArgs['mldsaSigner'],
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

    if (!result.transaction || result.transaction.length < 2) {
        throw new Error('Deployment signing returned incomplete transactions');
    }

    const fundingResult = await limitedProvider.broadcastTransaction(
        result.transaction[0],
        false,
    );
    if (!fundingResult?.success) {
        throw new Error('Funding transaction broadcast failed');
    }

    const deploymentResult = await limitedProvider.broadcastTransaction(
        result.transaction[1],
        false,
    );
    if (!deploymentResult?.success) {
        throw new Error('Deployment transaction broadcast failed');
    }

    const createdAt = new Date().toISOString();
    await saveCollection({
        contractAddress: result.contractAddress,
        creatorAgentAddress: params.address,
        ownerAddress: params.address,
        name: params.name,
        symbol: params.symbol,
        maxSupply: params.maxSupply,
        baseURI: params.baseURI ?? '',
        collectionBanner: params.collectionBanner ?? '',
        collectionIcon: params.collectionIcon ?? '',
        collectionWebsite: params.collectionWebsite ?? '',
        collectionDescription: params.collectionDescription ?? '',
        fundingTxHash: fundingResult.result ?? '',
        deploymentTxHash: deploymentResult.result ?? '',
        createdAt,
    });

    return {
        contractAddress: result.contractAddress,
        fundingTxHash: fundingResult.result ?? '',
        deploymentTxHash: deploymentResult.result ?? '',
    };
}
