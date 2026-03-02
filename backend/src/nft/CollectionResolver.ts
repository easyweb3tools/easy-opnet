import { CONTRACT_ADDRESSES } from '../config/contracts.js';
import { resolveAddressWithPublicKey } from '../providers/AddressResolver.js';
import { getProvider } from '../providers/ProviderManager.js';
import {
    getAgentCollectionContractAddress,
    getAgentCollectionId,
    getCollectionByCreatorAgent,
    listCollectionAddresses,
} from '../store/CollectionStore.js';

interface CollectionResolutionHint {
    readonly contractAddress?: string;
    readonly contractPublicKey?: string;
    readonly deploymentTxHash?: string;
    readonly collectionId?: string;
}

export interface ResolvedCollection {
    readonly contractAddress: string;
    readonly contractPublicKey?: string;
    readonly deploymentTxHash?: string;
    readonly collectionId?: string;
}

function normalizeAddress(address: string): string {
    return address.trim().toLowerCase();
}

async function isDeploymentPending(deploymentTxHash: string): Promise<boolean> {
    if (!deploymentTxHash) return false;
    const provider = getProvider();

    try {
        await provider.getTransaction(deploymentTxHash);
        return false;
    } catch {
        try {
            const pending = await provider.getPendingTransaction(deploymentTxHash);
            return Boolean(pending);
        } catch {
            return false;
        }
    }
}

async function ensureContractReachable(
    contractAddress: string,
    contractPublicKey?: string,
): Promise<void> {
    const provider = getProvider();
    await resolveAddressWithPublicKey(contractAddress, true, contractPublicKey);
    await provider.getCode(contractAddress, false);
}

export async function resolveCollectionForAgent(
    agentAddress: string,
    hint: CollectionResolutionHint = {},
): Promise<ResolvedCollection> {
    const normalizedAgent = normalizeAddress(agentAddress);
    const normalizedHubAddress = normalizeAddress(CONTRACT_ADDRESSES.nftHub || '');

    const hintedAddress = normalizeAddress(hint.contractAddress || '');
    if (hintedAddress) {
        try {
            await ensureContractReachable(hintedAddress, hint.contractPublicKey);
            const hintedCollectionId = hint.collectionId
                ?? (
                    normalizedHubAddress
                    && hintedAddress === normalizedHubAddress
                        ? await getAgentCollectionId(normalizedAgent)
                        : null
                );
            return {
                contractAddress: hintedAddress,
                contractPublicKey: hint.contractPublicKey,
                deploymentTxHash: hint.deploymentTxHash,
                collectionId: hintedCollectionId ?? undefined,
            };
        } catch {
            if (
                hint.deploymentTxHash
                && await isDeploymentPending(hint.deploymentTxHash)
            ) {
                throw new Error(
                    'Collection deployment transaction is still pending confirmation/indexing. '
                    + 'BTC blocks are ~10 minutes and can be longer. Please wait and retry.',
                );
            }
        }
    }

    const storedCollection = await getCollectionByCreatorAgent(normalizedAgent);
    if (storedCollection) {
        return {
            contractAddress: storedCollection.contractAddress,
            contractPublicKey: storedCollection.contractPublicKey,
            deploymentTxHash: storedCollection.deploymentTxHash,
            collectionId: storedCollection.collectionId,
        };
    }

    const [ownershipContractAddress, ownershipCollectionId] = await Promise.all([
        getAgentCollectionContractAddress(normalizedAgent),
        getAgentCollectionId(normalizedAgent),
    ]);

    if (ownershipContractAddress) {
        return {
            contractAddress: ownershipContractAddress,
            collectionId: ownershipCollectionId ?? undefined,
        };
    }

    if (normalizedHubAddress && ownershipCollectionId) {
        return {
            contractAddress: normalizedHubAddress,
            collectionId: ownershipCollectionId,
        };
    }

    throw new Error(
        `No collection found for agent ${normalizedAgent}. `
        + 'Create collection first via /api/agent/create-collection.',
    );
}

export async function resolveCollectionContractForAgent(
    agentAddress: string,
    hint: CollectionResolutionHint = {},
): Promise<string> {
    const resolved = await resolveCollectionForAgent(agentAddress, hint);
    return resolved.contractAddress;
}

export async function resolveDefaultCollectionContract(): Promise<string | null> {
    const normalizedHubAddress = normalizeAddress(CONTRACT_ADDRESSES.nftHub || '');
    if (normalizedHubAddress) return normalizedHubAddress;

    const addresses = await listCollectionAddresses();
    if (addresses.length === 0) return null;
    return addresses[0] ?? null;
}
