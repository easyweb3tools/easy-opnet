// ── Core domain types (mirrors frontend/src/types/index.ts exactly) ──

export interface Agent {
    readonly address: string;
    readonly name: string;
    readonly avatar: string;
    readonly publicKey: string;
    readonly registeredAt: string;
    readonly status: 'active' | 'inactive' | 'suspended';
    readonly stats: AgentStats;
}

export interface AgentStats {
    readonly minted: number;
    readonly trades: number;
    readonly volume: string; // satoshis as string
    readonly listed: number;
}

export interface NFTAttribute {
    readonly traitType: string;
    readonly value: string;
}

export interface NFT {
    readonly tokenId: string;
    readonly name: string;
    readonly description: string;
    readonly imageUrl: string;
    readonly owner: string;
    readonly creator: string;
    readonly mintedAt: string;
    readonly tokenUri: string;
    readonly attributes: readonly NFTAttribute[];
    readonly collectionName: string;
}

export interface Listing {
    readonly id: string;
    readonly nft: NFT;
    readonly seller: string;
    readonly price: string; // satoshis as string
    readonly auctionDuration: number; // seconds, 0 = fixed price
    readonly createdAt: string;
    readonly expiresAt: string | null;
    readonly status: 'active' | 'sold' | 'cancelled' | 'expired';
    readonly bidCount: number;
    readonly highestBid: string | null; // satoshis as string
}

export interface Bid {
    readonly id: string;
    readonly listingId: string;
    readonly bidder: string;
    readonly amount: string; // satoshis as string
    readonly createdAt: string;
    readonly status: 'active' | 'won' | 'outbid' | 'cancelled';
}

export type ActivityEventType =
    | 'mint'
    | 'list'
    | 'bid'
    | 'sale'
    | 'cancel'
    | 'transfer';

export interface ActivityEvent {
    readonly id: string;
    readonly type: ActivityEventType;
    readonly agent: string;
    readonly agentName: string;
    readonly tokenId: string | null;
    readonly nftName: string | null;
    readonly listingId: string | null;
    readonly amount: string | null; // satoshis as string
    readonly timestamp: string;
    readonly txHash: string;
}

export interface MarketplaceStats {
    readonly totalVolume: string; // satoshis as string
    readonly totalSales: number;
    readonly totalListings: number;
    readonly activeListings: number;
    readonly totalAgents: number;
    readonly activeAgents: number;
    readonly floorPrice: string; // satoshis as string
    readonly avgPrice: string; // satoshis as string
    readonly volume24h: string; // satoshis as string
    readonly sales24h: number;
}

// ── API response types ──

export interface PaginatedResponse<T> {
    readonly items: readonly T[];
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
}

export interface ApiResponse<T> {
    readonly success: boolean;
    readonly data: T;
    readonly error?: string;
}

// ── Query param types ──

export type ListingSortOption =
    | 'newest'
    | 'price_asc'
    | 'price_desc'
    | 'ending_soon'
    | 'most_bids';

export interface ListingQueryParams {
    readonly sort?: ListingSortOption;
    readonly status?: 'active' | 'sold' | 'all';
    readonly minPrice?: string;
    readonly maxPrice?: string;
    readonly agent?: string;
    readonly limit?: number;
    readonly offset?: number;
}

export type ActivityFilterType = ActivityEventType | 'all';

export interface ActivityQueryParams {
    readonly type?: ActivityFilterType;
    readonly agent?: string;
    readonly limit?: number;
    readonly offset?: number;
}

// ── Agent action types ──

export interface MintRequest {
    readonly address: string;
    readonly collectionContractAddress?: string;
    readonly collectionContractPublicKey?: string;
    readonly collectionDeploymentTxHash?: string;
    readonly collectionId?: string;
    readonly metadata: {
        readonly name: string;
        readonly description: string;
        readonly imageUrl: string;
        readonly attributes: readonly NFTAttribute[];
    };
    readonly recipient?: string;
    readonly recipientPublicKey?: string;
    readonly listImmediately?: boolean;
    readonly listPrice?: string;
}

export interface ListRequest {
    readonly address: string;
    readonly tokenId: string;
    readonly price: string;
    readonly auctionDuration?: number;
    readonly nftContractAddress?: string;
}

export interface BidRequest {
    readonly address: string;
    readonly listingId: string;
    readonly amount: string;
}

export interface BuyRequest {
    readonly address: string;
    readonly listingId: string;
}

export interface CancelRequest {
    readonly address: string;
    readonly listingId: string;
}

export interface DeployCollectionRequest {
    readonly address: string;
    readonly publicKey?: string;
    readonly name: string;
    readonly symbol: string;
    readonly maxSupply: string;
    readonly baseURI?: string;
    readonly collectionBanner?: string;
    readonly collectionIcon?: string;
    readonly collectionWebsite?: string;
    readonly collectionDescription?: string;
}

export interface DeployCollectionResponse {
    readonly txHash?: string;
    readonly collectionId?: string;
    readonly contractAddress: string;
    readonly contractPublicKey?: string;
    readonly fundingTxHash: string;
    readonly deploymentTxHash: string;
}

export interface ImportCollectionRequest {
    readonly address: string;
    readonly nftContractAddress: string;
    readonly name?: string;
    readonly symbol?: string;
    readonly collectionBanner?: string;
    readonly collectionIcon?: string;
    readonly collectionWebsite?: string;
    readonly collectionDescription?: string;
}

export interface ImportCollectionResponse {
    readonly collectionId: string;
    readonly nftContractAddress: string;
    readonly verified: boolean;
    readonly tokenCount: number;
}

export type CreateCollectionRequest = DeployCollectionRequest;
export type CreateCollectionResponse = DeployCollectionResponse;

export interface AgentActionResponse {
    readonly txHash: string;
    readonly tokenId?: string;
    readonly listingId?: string;
    readonly bidId?: string;
}
