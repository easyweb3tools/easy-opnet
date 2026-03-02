import { getWalletAddress } from '../agents/AgentWallet.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';
import { setContractSender } from '../providers/AddressResolver.js';
import { getHubContract } from '../providers/ContractCache.js';
import { executeTx } from '../market/TxExecutor.js';
import { saveCollection } from '../store/CollectionStore.js';
import type {
    CreateCollectionRequest,
    CreateCollectionResponse,
} from '../types/index.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    error?: string;
    result?: unknown;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

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

export async function createCollection(
    params: CreateCollectionRequest,
): Promise<CreateCollectionResponse> {
    const maxSupply = parseMaxSupply(params.maxSupply);
    const walletAddress = getWalletAddress();

    const hubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
    if (!hubAddress) {
        throw new Error('NFT_HUB_CONTRACT_ADDRESS is not configured');
    }

    const contract = await getHubContract(walletAddress);
    await setContractSender(contract, walletAddress);

    const createCollectionFn = (contract as unknown as Record<string, ContractMethod>).createCollection;
    if (!createCollectionFn) {
        throw new Error('createCollection method not found on NFT Hub contract');
    }

    const simulation = await createCollectionFn(
        params.name,
        params.symbol,
        maxSupply,
        params.baseURI ?? '',
        params.collectionBanner ?? '',
        params.collectionIcon ?? '',
        params.collectionWebsite ?? '',
        params.collectionDescription ?? '',
    );

    const collectionIdValue =
        simulation.decoded?.collectionId
        ?? simulation.properties?.collectionId
        ?? simulation.result
        ?? undefined;
    const collectionId = collectionIdValue != null ? String(collectionIdValue) : '';
    if (!collectionId) {
        throw new Error(
            'Failed to decode collectionId from createCollection simulation: '
            + JSON.stringify({ decoded: simulation.decoded, properties: simulation.properties, result: simulation.result, error: simulation.error }),
        );
    }

    const receipt = await executeTx(simulation as unknown as Record<string, unknown>);
    const txHash = receipt.transactionId;

    const now = new Date().toISOString();
    await saveCollection({
        contractAddress: hubAddress,
        contractPublicKey: undefined,
        creatorAgentAddress: params.address,
        creatorAgentPublicKey: params.publicKey,
        ownerAddress: params.address,
        ownerPublicKey: params.publicKey,
        collectionId,
        name: params.name,
        symbol: params.symbol,
        maxSupply: params.maxSupply,
        baseURI: params.baseURI ?? '',
        collectionBanner: params.collectionBanner ?? '',
        collectionIcon: params.collectionIcon ?? '',
        collectionWebsite: params.collectionWebsite ?? '',
        collectionDescription: params.collectionDescription ?? '',
        fundingTxHash: txHash,
        deploymentTxHash: txHash,
        txHash,
        createdAt: now,
    });

    return {
        txHash,
        collectionId,
        contractAddress: hubAddress,
        contractPublicKey: undefined,
        fundingTxHash: txHash,
        deploymentTxHash: txHash,
    };
}
