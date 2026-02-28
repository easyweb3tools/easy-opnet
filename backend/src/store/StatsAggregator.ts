import type { MarketplaceStats } from '../types/index.js';
import { getListingCount, getListingState } from '../market/EscrowManager.js';
import { getRecentSales, getAllEvents } from './ActivityStore.js';
import { getNftContract } from '../providers/ContractCache.js';
import { getWalletAddress } from '../agents/AgentWallet.js';
import { listCollectionAddresses } from './CollectionStore.js';

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    error?: string;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

async function getAgentCountForCollection(nftContractAddress: string): Promise<number> {
    try {
        const contract = getNftContract(getWalletAddress(), nftContractAddress);
        const fn = (contract as unknown as Record<string, ContractMethod>).getAgentCount;
        if (!fn) return 0;

        const result = await fn();
        if (result.error) return 0;

        return Number(result.decoded?.count ?? 0);
    } catch {
        return 0;
    }
}

export async function computeStats(): Promise<MarketplaceStats> {
    const [totalListingCount, collectionAddresses] = await Promise.all([
        getListingCount(),
        listCollectionAddresses(),
    ]);
    const perCollectionAgentCounts = await Promise.all(
        collectionAddresses.map((address) => getAgentCountForCollection(address)),
    );
    const agentCount = perCollectionAgentCounts.reduce((sum, value) => sum + value, 0);

    // Scan listings for active count and price stats
    let activeListings = 0;
    let floorPrice = BigInt(0);
    let totalPrice = BigInt(0);
    let priceCount = 0;

    for (let i = 0; i < totalListingCount; i++) {
        const listing = await getListingState(String(i));
        if (!listing) continue;

        if (listing.status === 1) {
            // ACTIVE
            activeListings++;
            const price = BigInt(listing.price);
            totalPrice += price;
            priceCount++;

            if (floorPrice === 0n || price < floorPrice) {
                floorPrice = price;
            }
        }
    }

    const avgPrice = priceCount > 0 ? totalPrice / BigInt(priceCount) : 0n;

    // 24h stats from ActivityStore
    const MS_24H = 24 * 60 * 60 * 1000;
    const recentSales = getRecentSales(MS_24H);
    const sales24h = recentSales.length;
    const volume24h = recentSales.reduce(
        (sum, e) => sum + BigInt(e.amount ?? '0'),
        0n,
    );

    // Total volume/sales from all recorded activity
    const allEvents = getAllEvents();
    const allSales = allEvents.filter((e) => e.type === 'sale');
    const totalVolume = allSales.reduce(
        (sum, e) => sum + BigInt(e.amount ?? '0'),
        0n,
    );

    return {
        totalVolume: totalVolume.toString(),
        totalSales: allSales.length,
        totalListings: totalListingCount,
        activeListings,
        totalAgents: agentCount,
        activeAgents: agentCount, // all registered agents considered active
        floorPrice: floorPrice.toString(),
        avgPrice: avgPrice.toString(),
        volume24h: volume24h.toString(),
        sales24h,
    };
}
