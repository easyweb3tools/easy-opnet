import { getMarketplaceContract } from '../providers/ContractCache.js';
import { getWalletAddress } from '../agents/AgentWallet.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    error?: string;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

interface ListingState {
    seller: string;
    price: string;
    status: number; // 1=ACTIVE, 2=SOLD, 3=CANCELLED
    tokenId: string;
    nftContract: string;
    expiration: string;
    bidCount: number;
    highestBid: string;
    highestBidder: string;
    auctionDuration: string;
}

/**
 * Reads listing state from the marketplace contract.
 */
export async function getListingState(listingId: string): Promise<ListingState | null> {
    try {
        const contract = getMarketplaceContract(getWalletAddress());
        const getListingFn = (contract as unknown as Record<string, ContractMethod>).getListing;
        if (!getListingFn) return null;

        const result = await getListingFn(BigInt(listingId));

        if (result.error) {
            return null;
        }

        const decoded = result.decoded;
        if (!decoded) return null;

        return {
            seller: String(decoded.seller ?? ''),
            price: String(decoded.price ?? '0'),
            status: Number(decoded.status ?? 0),
            tokenId: String(decoded.tokenId ?? '0'),
            nftContract: String(decoded.nftContract ?? ''),
            expiration: String(decoded.expiration ?? '0'),
            bidCount: Number(decoded.bidCount ?? 0),
            highestBid: String(decoded.highestBid ?? '0'),
            highestBidder: String(decoded.highestBidder ?? ''),
            auctionDuration: String(decoded.auctionDuration ?? '0'),
        };
    } catch (error) {
        console.error('Failed to get listing state:', error);
        return null;
    }
}

/**
 * Gets the total listing count from the marketplace contract.
 */
export async function getListingCount(): Promise<number> {
    try {
        const contract = getMarketplaceContract(getWalletAddress());
        const getListingCountFn = (contract as unknown as Record<string, ContractMethod>).getListingCount;
        if (!getListingCountFn) return 0;

        const result = await getListingCountFn();

        if (result.error) {
            return 0;
        }

        return Number(result.decoded?.count ?? 0);
    } catch {
        return 0;
    }
}
