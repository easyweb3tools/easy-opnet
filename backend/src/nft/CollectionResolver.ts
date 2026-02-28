import {
    getCollectionByCreatorAgent,
    listCollectionAddresses,
} from '../store/CollectionStore.js';

export async function resolveCollectionContractForAgent(
    agentAddress: string,
): Promise<string> {
    const collection = await getCollectionByCreatorAgent(agentAddress);
    if (!collection) {
        throw new Error(
            `No deployed collection found for agent ${agentAddress}. Deploy collection first via /api/agent/deploy-collection.`,
        );
    }

    return collection.contractAddress;
}

export async function resolveDefaultCollectionContract(): Promise<string | null> {
    const addresses = await listCollectionAddresses();
    if (addresses.length === 0) return null;
    return addresses[0] ?? null;
}
