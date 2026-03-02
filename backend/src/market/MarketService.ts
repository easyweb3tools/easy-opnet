import { getMarketplaceContract } from '../providers/ContractCache.js';
import { resolveAddress, setContractSender } from '../providers/AddressResolver.js';
import { getWalletAddress } from '../agents/AgentWallet.js';
import { executeTx } from './TxExecutor.js';

type ContractMethod = (...args: unknown[]) => Promise<Record<string, unknown>>;

interface ListingResult {
    txHash: string;
    listingId: string;
}

interface BuyResult {
    txHash: string;
}

interface BidResult {
    txHash: string;
}

interface CancelResult {
    txHash: string;
}

/**
 * Lists an NFT on the marketplace.
 * Flow: approve NFT → call marketplace.listNFT()
 */
export async function listNFT(
    nftContractAddress: string,
    tokenId: string,
    price: string,
    auctionDuration: number = 0,
): Promise<ListingResult> {
    const walletAddr = getWalletAddress();
    const contract = await getMarketplaceContract(walletAddr);
    await setContractSender(contract, walletAddr);
    const listNFTFn = (contract as unknown as Record<string, ContractMethod>).listNFT;
    if (!listNFTFn) {
        throw new Error('listNFT method not found on contract');
    }

    const nftContract = await resolveAddress(nftContractAddress, true);

    // Simulate listNFT
    const simulation = await listNFTFn(
        nftContract,
        BigInt(tokenId),
        BigInt(price),
        BigInt(auctionDuration),
    );

    // Extract listingId from simulation decoded result
    const decoded = (simulation as { decoded?: Record<string, unknown> }).decoded;
    const listingId = decoded?.listingId != null ? String(decoded.listingId) : '0';

    const receipt = await executeTx(simulation);

    return {
        txHash: receipt.transactionId,
        listingId,
    };
}

/**
 * Buys an NFT at the fixed price.
 * Uses setTransactionDetails() BEFORE simulate for BTC payment output.
 */
export async function buyNow(
    listingId: string,
    sellerAddress: string,
    price: string,
): Promise<BuyResult> {
    const walletAddr = getWalletAddress();
    const contract = await getMarketplaceContract(walletAddr);
    await setContractSender(contract, walletAddr);
    const methods = contract as unknown as Record<string, ContractMethod | ((...args: unknown[]) => void)>;

    // Set transaction details BEFORE simulate for BTC payment
    if (typeof methods.setTransactionDetails === 'function') {
        methods.setTransactionDetails({
            inputs: [],
            outputs: [
                {
                    to: sellerAddress,
                    value: BigInt(price),
                },
            ],
        });
    }

    // Simulate buyNow
    const buyNowFn = methods.buyNow as ContractMethod | undefined;
    if (!buyNowFn) {
        throw new Error('buyNow method not found on contract');
    }

    const simulation = await buyNowFn(BigInt(listingId));

    const receipt = await executeTx(
        simulation,
        {
            extraOutputs: [
                {
                    address: sellerAddress,
                    value: Number(price),
                },
            ],
        },
    );

    return { txHash: receipt.transactionId };
}

/**
 * Places a bid on an auction listing.
 */
export async function placeBid(
    listingId: string,
    bidAmount: string,
): Promise<BidResult> {
    const walletAddr = getWalletAddress();
    const contract = await getMarketplaceContract(walletAddr);
    await setContractSender(contract, walletAddr);
    const placeBidFn = (contract as unknown as Record<string, ContractMethod>).placeBid;
    if (!placeBidFn) {
        throw new Error('placeBid method not found on contract');
    }

    const simulation = await placeBidFn(
        BigInt(listingId),
        BigInt(bidAmount),
    );

    const receipt = await executeTx(simulation);

    return { txHash: receipt.transactionId };
}

/**
 * Cancels an active listing (seller only, no bids).
 */
export async function cancelListing(listingId: string): Promise<CancelResult> {
    const walletAddr = getWalletAddress();
    const contract = await getMarketplaceContract(walletAddr);
    await setContractSender(contract, walletAddr);
    const cancelListingFn = (contract as unknown as Record<string, ContractMethod>).cancelListing;
    if (!cancelListingFn) {
        throw new Error('cancelListing method not found on contract');
    }

    const simulation = await cancelListingFn(BigInt(listingId));

    const receipt = await executeTx(simulation);

    return { txHash: receipt.transactionId };
}
