import { getNftContract } from '../providers/ContractCache.js';
import { getWalletAddress } from '../agents/AgentWallet.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    error?: string;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

/**
 * Reads on-chain NFT state (ownerOf, tokenURI, balanceOf).
 */
export async function getTokenOwner(tokenId: string): Promise<string | null> {
    try {
        const contract = getNftContract(getWalletAddress());
        const ownerOfFn = (contract as unknown as Record<string, ContractMethod>).ownerOf;
        if (!ownerOfFn) return null;

        const result = await ownerOfFn(BigInt(tokenId));

        if (result.error) {
            return null;
        }

        return String(result.decoded?.owner ?? '');
    } catch {
        return null;
    }
}

export async function getTokenURI(tokenId: string): Promise<string | null> {
    try {
        const contract = getNftContract(getWalletAddress());
        const tokenURIFn = (contract as unknown as Record<string, ContractMethod>).tokenURI;
        if (!tokenURIFn) return null;

        const result = await tokenURIFn(BigInt(tokenId));

        if (result.error) {
            return null;
        }

        return String(result.decoded?.uri ?? '');
    } catch {
        return null;
    }
}

export async function getBalanceOf(address: string): Promise<bigint> {
    try {
        const contract = getNftContract(getWalletAddress());
        const balanceOfFn = (contract as unknown as Record<string, ContractMethod>).balanceOf;
        if (!balanceOfFn) return 0n;

        const result = await balanceOfFn(address);

        if (result.error) {
            return 0n;
        }

        return BigInt(String(result.decoded?.balance ?? 0));
    } catch {
        return 0n;
    }
}
