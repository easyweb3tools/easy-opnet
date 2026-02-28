import { getNftContract } from '../providers/ContractCache.js';
import { getWalletAddress } from './AgentWallet.js';
import { executeTx } from '../market/TxExecutor.js';
import {
    getAgentOwnerAddress,
    getAgentsByOwnerAddress,
    getCollectionByCreatorAgent,
    listCollectionAddresses,
    saveAgentOwnership,
} from '../store/CollectionStore.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    error?: string;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

function normalizeAddress(address: string): string {
    return address.trim().toLowerCase();
}

async function isAgentInCollection(
    agentAddress: string,
    nftContractAddress: string,
): Promise<boolean> {
    try {
        const contract = getNftContract(getWalletAddress(), nftContractAddress);
        const callFn = (contract as unknown as Record<string, ContractMethod>).isAgent;
        if (!callFn) return false;

        const result = await callFn(agentAddress);
        if (result.error) return false;
        return Boolean(result.decoded?.result);
    } catch {
        return false;
    }
}

/**
 * Checks if an address is a registered agent on-chain.
 * If `nftContractAddress` is omitted, scans all known collections.
 */
export async function isRegisteredAgent(
    agentAddress: string,
    nftContractAddress?: string,
): Promise<boolean> {
    if (nftContractAddress) {
        return isAgentInCollection(agentAddress, nftContractAddress);
    }

    const collectionAddresses = await listCollectionAddresses();
    for (const collectionAddress of collectionAddresses) {
        if (await isAgentInCollection(agentAddress, collectionAddress)) {
            return true;
        }
    }

    return false;
}

/**
 * Registers a new agent on-chain in the agent's deployed collection.
 */
export async function registerAgentOnChain(
    agentAddress: string,
    ownerAddress: string,
    ownerPublicKey?: string,
): Promise<string> {
    const normalizedAgent = normalizeAddress(agentAddress);
    const normalizedOwner = normalizeAddress(ownerAddress || agentAddress);

    const collection = await getCollectionByCreatorAgent(normalizedAgent);
    if (!collection) {
        throw new Error(
            `No collection found for agent ${normalizedAgent}. Deploy collection first via /api/agent/deploy-collection.`,
        );
    }

    const contract = getNftContract(getWalletAddress(), collection.contractAddress);

    const methods = contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>;
    const callWithOwner = methods.registerAgentWithOwner;
    const legacyRegister = methods.registerAgent;

    let simulation: Record<string, unknown>;
    if (callWithOwner) {
        simulation = await callWithOwner(normalizedAgent, normalizedOwner);
    } else if (legacyRegister) {
        simulation = await legacyRegister(normalizedAgent);
    } else {
        throw new Error('registerAgentWithOwner/registerAgent method not found on contract');
    }

    const receipt = await executeTx(simulation);

    await saveAgentOwnership({
        agentAddress: normalizedAgent,
        ownerAddress: normalizedOwner,
        ownerPublicKey,
        collectionContractAddress: collection.contractAddress,
        txHash: receipt.transactionId,
        registeredAt: new Date().toISOString(),
    });

    return receipt.transactionId;
}

/**
 * Reads owner address for a registered agent.
 */
export async function getAgentOwner(agentAddress: string): Promise<string | null> {
    const normalizedAgent = normalizeAddress(agentAddress);
    const storedOwner = await getAgentOwnerAddress(normalizedAgent);
    if (storedOwner) return storedOwner;

    const collection = await getCollectionByCreatorAgent(normalizedAgent);
    if (!collection) return null;

    try {
        const contract = getNftContract(getWalletAddress(), collection.contractAddress);
        const callFn = (contract as unknown as Record<string, ContractMethod>).getAgentOwner;
        if (!callFn) return null;

        const result = await callFn(normalizedAgent);
        if (result.error) return null;

        const owner = result.decoded?.owner != null ? String(result.decoded.owner) : '';
        if (!owner) return null;

        await saveAgentOwnership({
            agentAddress: normalizedAgent,
            ownerAddress: normalizeAddress(owner),
            collectionContractAddress: collection.contractAddress,
            txHash: undefined,
            registeredAt: new Date().toISOString(),
        });

        return normalizeAddress(owner);
    } catch {
        return null;
    }
}

export async function getAgentsByOwner(ownerAddress: string): Promise<string[]> {
    return getAgentsByOwnerAddress(ownerAddress);
}
