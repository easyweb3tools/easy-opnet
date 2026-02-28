import { getNftContract } from '../providers/ContractCache.js';
import { getWalletAddress } from './AgentWallet.js';
import { executeTx } from '../market/TxExecutor.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    error?: string;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

const ownerToAgents = new Map<string, Set<string>>();
const agentToOwner = new Map<string, string>();

function normalizeAddress(address: string): string {
    return address.trim().toLowerCase();
}

function trackAgentOwner(agentAddress: string, ownerAddress: string): void {
    const agent = normalizeAddress(agentAddress);
    const owner = normalizeAddress(ownerAddress);

    const previousOwner = agentToOwner.get(agent);
    if (previousOwner && previousOwner !== owner) {
        const previousSet = ownerToAgents.get(previousOwner);
        if (previousSet) {
            previousSet.delete(agent);
            if (previousSet.size === 0) {
                ownerToAgents.delete(previousOwner);
            }
        }
    }

    agentToOwner.set(agent, owner);
    const set = ownerToAgents.get(owner) ?? new Set<string>();
    set.add(agent);
    ownerToAgents.set(owner, set);
}

/**
 * Checks if an address is a registered agent on-chain via the NFT contract's isAgent() method.
 */
export async function isRegisteredAgent(address: string): Promise<boolean> {
    try {
        const contract = getNftContract(getWalletAddress());
        const callFn = (contract as unknown as Record<string, ContractMethod>).isAgent;
        if (!callFn) return false;

        const result = await callFn(address);

        if (result.error) {
            console.error('isAgent call failed:', result.error);
            return false;
        }

        return Boolean(result.decoded?.result);
    } catch (error) {
        console.error('Failed to check agent registration:', error);
        return false;
    }
}

/**
 * Registers a new agent on-chain (deployer only).
 */
export async function registerAgentOnChain(
    agentAddress: string,
    ownerAddress: string,
): Promise<string> {
    const contract = getNftContract(getWalletAddress());
    const owner = normalizeAddress(ownerAddress || agentAddress);

    const methods = contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>;
    const callWithOwner = methods.registerAgentWithOwner;
    const legacyRegister = methods.registerAgent;

    let simulation: Record<string, unknown>;
    if (callWithOwner) {
        simulation = await callWithOwner(agentAddress, owner);
    } else if (legacyRegister) {
        simulation = await legacyRegister(agentAddress);
    } else {
        throw new Error('registerAgentWithOwner/registerAgent method not found on contract');
    }

    const receipt = await executeTx(simulation);
    trackAgentOwner(agentAddress, owner);

    return receipt.transactionId;
}

export async function getAgentOwner(agentAddress: string): Promise<string | null> {
    try {
        const contract = getNftContract(getWalletAddress());
        const callFn = (contract as unknown as Record<string, ContractMethod>).getAgentOwner;
        if (!callFn) {
            return agentToOwner.get(normalizeAddress(agentAddress)) ?? null;
        }

        const result = await callFn(agentAddress);
        if (result.error) {
            return agentToOwner.get(normalizeAddress(agentAddress)) ?? null;
        }

        const owner = result.decoded?.owner != null ? String(result.decoded.owner) : '';
        if (!owner) {
            return agentToOwner.get(normalizeAddress(agentAddress)) ?? null;
        }

        trackAgentOwner(agentAddress, owner);
        return owner;
    } catch {
        return agentToOwner.get(normalizeAddress(agentAddress)) ?? null;
    }
}

export function getAgentsByOwner(ownerAddress: string): string[] {
    const normalized = normalizeAddress(ownerAddress);
    const set = ownerToAgents.get(normalized);
    if (!set) return [];
    return [...set];
}
