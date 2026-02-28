import { getNftContract } from '../providers/ContractCache.js';
import { getWalletAddress } from './AgentWallet.js';
import { executeTx } from '../market/TxExecutor.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    error?: string;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

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
export async function registerAgentOnChain(agentAddress: string): Promise<string> {
    const contract = getNftContract(getWalletAddress());
    const callFn = (contract as unknown as Record<string, (addr: string) => Promise<Record<string, unknown>>>).registerAgent;
    if (!callFn) {
        throw new Error('registerAgent method not found on contract');
    }

    const simulation = await callFn(agentAddress);

    const receipt = await executeTx(simulation);

    return receipt.transactionId;
}
