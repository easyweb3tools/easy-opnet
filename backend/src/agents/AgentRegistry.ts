import { getHubContract, getNftContract } from '../providers/ContractCache.js';
import {
    resolveAddress,
    resolveAddressWithPublicKey,
    setContractSender,
} from '../providers/AddressResolver.js';
import { getWalletAddress } from './AgentWallet.js';
import { executeTx } from '../market/TxExecutor.js';
import {
    getAgentOwnerAddress,
    getAgentPublicKey,
    getAgentsByOwnerAddress,
    listCollectionAddresses,
    saveAgentOwnership,
} from '../store/CollectionStore.js';
import {
    resolveCollectionContractForAgent,
    resolveCollectionForAgent,
} from '../nft/CollectionResolver.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    error?: string;
    result?: unknown;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

function normalizeAddress(address: string): string {
    return address.trim().toLowerCase();
}

function decodeBooleanResult(result: ContractCallResult): boolean {
    const decoded = result.decoded;
    if (decoded && typeof decoded.result === 'boolean') {
        return decoded.result;
    }

    const properties = result.properties;
    if (properties && typeof properties.result === 'boolean') {
        return properties.result;
    }

    if (typeof result.result === 'boolean') {
        return result.result;
    }

    return false;
}

async function isAgentInCollection(
    agentAddress: string,
    nftContractAddress: string,
    agentPublicKeyHint?: string,
): Promise<boolean> {
    try {
        const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
        const normalizedContractAddress = nftContractAddress.trim().toLowerCase();
        const contract = normalizedHubAddress && normalizedContractAddress === normalizedHubAddress
            ? await getHubContract(getWalletAddress())
            : await getNftContract(getWalletAddress(), nftContractAddress);
        const callFn = (contract as unknown as Record<string, ContractMethod>).isAgent;
        if (!callFn) return false;

        const agent = await resolveAddressWithPublicKey(agentAddress, false, agentPublicKeyHint);
        const result = await callFn(agent);
        if (result.error) return false;
        return decodeBooleanResult(result);
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
    agentPublicKeyHint?: string,
): Promise<boolean> {
    if (nftContractAddress) {
        return isAgentInCollection(agentAddress, nftContractAddress, agentPublicKeyHint);
    }

    const collectionAddresses = await listCollectionAddresses();
    for (const collectionAddress of collectionAddresses) {
        if (await isAgentInCollection(agentAddress, collectionAddress, agentPublicKeyHint)) {
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
    agentPublicKey?: string,
    collectionHint?: {
        readonly contractAddress?: string;
        readonly contractPublicKey?: string;
        readonly deploymentTxHash?: string;
        readonly collectionId?: string;
    },
): Promise<string> {
    const normalizedAgent = normalizeAddress(agentAddress);
    const normalizedOwner = normalizeAddress(ownerAddress || agentAddress);

    const resolvedCollection = await resolveCollectionForAgent(
        normalizedAgent,
        collectionHint,
    );
    const collectionContractAddress = resolvedCollection.contractAddress;

    const walletAddress = getWalletAddress();
    const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
    const contract = normalizedHubAddress
        && collectionContractAddress.trim().toLowerCase() === normalizedHubAddress
        ? await getHubContract(walletAddress)
        : await getNftContract(walletAddress, collectionContractAddress);
    await setContractSender(contract, walletAddress);
    const agent = await resolveAddressWithPublicKey(
        normalizedAgent,
        false,
        agentPublicKey,
    );
    const owner = await resolveAddressWithPublicKey(
        normalizedOwner,
        false,
        ownerPublicKey,
    );

    const methods = contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>;
    const callWithOwner = methods.registerAgentWithOwner;
    const legacyRegister = methods.registerAgent;

    let simulation: Record<string, unknown>;
    if (callWithOwner) {
        simulation = await callWithOwner(agent, owner);
    } else if (legacyRegister) {
        simulation = await legacyRegister(agent);
    } else {
        throw new Error('registerAgentWithOwner/registerAgent method not found on contract');
    }

    const receipt = await executeTx(simulation);

    await saveAgentOwnership({
        agentAddress: normalizedAgent,
        agentPublicKey,
        ownerAddress: normalizedOwner,
        ownerPublicKey,
        collectionContractAddress,
        collectionId: resolvedCollection.collectionId,
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

    let collectionContractAddress: string;
    try {
        collectionContractAddress = await resolveCollectionContractForAgent(normalizedAgent);
    } catch {
        return null;
    }

    try {
        const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
        const contract = normalizedHubAddress
            && collectionContractAddress.trim().toLowerCase() === normalizedHubAddress
            ? await getHubContract(getWalletAddress())
            : await getNftContract(getWalletAddress(), collectionContractAddress);
        const callFn = (contract as unknown as Record<string, ContractMethod>).getAgentOwner;
        if (!callFn) return null;

        const storedAgentPublicKey = await getAgentPublicKey(normalizedAgent);
        const agent = await resolveAddressWithPublicKey(
            normalizedAgent,
            false,
            storedAgentPublicKey ?? undefined,
        );
        const result = await callFn(agent);
        if (result.error) return null;

        const owner = result.decoded?.owner != null ? String(result.decoded.owner) : '';
        if (!owner) return null;

        await saveAgentOwnership({
            agentAddress: normalizedAgent,
            ownerAddress: normalizeAddress(owner),
            collectionContractAddress,
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
