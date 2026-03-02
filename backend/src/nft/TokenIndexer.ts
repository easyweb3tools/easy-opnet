import { getNftContract } from '../providers/ContractCache.js';
import { getHubContract } from '../providers/ContractCache.js';
import { resolveAddressWithPublicKey } from '../providers/AddressResolver.js';
import { getWalletAddress } from '../agents/AgentWallet.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    error?: string;
    result?: unknown;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

function decodeField(result: ContractCallResult, key: string): unknown {
    if (result.decoded && key in result.decoded) {
        return result.decoded[key];
    }
    if (result.properties && key in result.properties) {
        return result.properties[key];
    }
    if (key === 'result') {
        return result.result;
    }
    return undefined;
}

/**
 * Reads on-chain NFT state (ownerOf, tokenURI, balanceOf).
 */
export async function getTokenOwner(
    tokenId: string,
    nftContractAddress: string,
): Promise<string | null> {
    try {
        const contract = await getNftContract(getWalletAddress(), nftContractAddress);
        const ownerOfFn = (contract as unknown as Record<string, ContractMethod>).ownerOf;
        if (!ownerOfFn) return null;

        const result = await ownerOfFn(BigInt(tokenId));

        if (result.error) {
            return null;
        }

        return String(decodeField(result, 'owner') ?? '');
    } catch {
        return null;
    }
}

export async function getTokenURI(
    tokenId: string,
    nftContractAddress: string,
): Promise<string | null> {
    try {
        const contract = await getNftContract(getWalletAddress(), nftContractAddress);
        const tokenURIFn = (contract as unknown as Record<string, ContractMethod>).tokenURI;
        if (!tokenURIFn) return null;

        const result = await tokenURIFn(BigInt(tokenId));

        if (result.error) {
            return null;
        }

        return String(decodeField(result, 'uri') ?? '');
    } catch {
        return null;
    }
}

export async function getBalanceOf(
    address: string,
    nftContractAddress: string,
    publicKeyHint?: string,
    collectionId?: string,
): Promise<bigint> {
    try {
        const normalizedNftAddress = nftContractAddress.trim().toLowerCase();
        const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
        const isHub = normalizedHubAddress && normalizedNftAddress === normalizedHubAddress;
        if (isHub && !collectionId) {
            return 0n;
        }

        const contract = isHub
            ? await getHubContract(getWalletAddress())
            : await getNftContract(getWalletAddress(), nftContractAddress);
        const balanceOfFn = (contract as unknown as Record<string, ContractMethod>).balanceOf;
        if (!balanceOfFn) return 0n;

        const owner = await resolveAddressWithPublicKey(address, false, publicKeyHint);
        const result = isHub
            ? await balanceOfFn(BigInt(collectionId as string), owner)
            : await balanceOfFn(owner);

        if (result.error) {
            return 0n;
        }

        return BigInt(String(decodeField(result, 'balance') ?? 0));
    } catch {
        return 0n;
    }
}

export async function getTokenOfOwnerByIndex(
    address: string,
    index: bigint,
    nftContractAddress: string,
    publicKeyHint?: string,
): Promise<string | null> {
    try {
        const contract = await getNftContract(getWalletAddress(), nftContractAddress);
        const tokenOfOwnerByIndexFn = (contract as unknown as Record<string, ContractMethod>).tokenOfOwnerByIndex;
        if (!tokenOfOwnerByIndexFn) return null;

        const owner = await resolveAddressWithPublicKey(address, false, publicKeyHint);
        const result = await tokenOfOwnerByIndexFn(owner, index);

        if (result.error) return null;
        const tokenId = decodeField(result, 'tokenId');
        if (tokenId == null) return null;
        return String(tokenId);
    } catch {
        return null;
    }
}
