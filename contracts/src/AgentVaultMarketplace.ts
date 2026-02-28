import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    OP_NET,
    Revert,
    SafeMath,
    StoredAddress,
    StoredMapU256,
    StoredU256,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

import { IS_AGENT, TRANSFER_FROM } from './lib/Selectors';
import {
    ERR_BID_TOO_LOW,
    ERR_FEE_TOO_HIGH,
    ERR_HAS_BIDS,
    ERR_IS_AUCTION,
    ERR_LISTING_EXPIRED,
    ERR_LISTING_NOT_ACTIVE,
    ERR_NFT_TRANSFER_FAILED,
    ERR_NOT_AGENT,
    ERR_NOT_AUCTION,
    ERR_NOT_EXPIRED,
    ERR_NOT_SELLER,
    ERR_NO_BIDS,
    ERR_PRICE_ZERO,
    ERR_SELF_BID,
    ERR_ZERO_ADDRESS,
} from './lib/Errors';

// Listing status constants
const STATUS_ACTIVE: u256 = u256.One;
const STATUS_SOLD: u256 = u256.fromU64(2);
const STATUS_CANCELLED: u256 = u256.fromU64(3);

// Maximum fee: 10% = 1000 basis points
const MAX_FEE_BPS: u256 = u256.fromU64(1000);
const DEFAULT_FEE_BPS: u256 = u256.fromU64(250); // 2.5%

@final
export class AgentVaultMarketplace extends OP_NET {
    // ── Scalar storage pointers ──
    private readonly listingCountPointer: u16 = Blockchain.nextPointer;
    private readonly feeBasisPointsPointer: u16 = Blockchain.nextPointer;
    private readonly nftContractPointer: u16 = Blockchain.nextPointer;

    // ── Per-listing field map pointers ──
    private readonly sellerMapPointer: u16 = Blockchain.nextPointer;
    private readonly priceMapPointer: u16 = Blockchain.nextPointer;
    private readonly statusMapPointer: u16 = Blockchain.nextPointer;
    private readonly tokenIdMapPointer: u16 = Blockchain.nextPointer;
    private readonly expirationMapPointer: u16 = Blockchain.nextPointer;
    private readonly nftContractMapPointer: u16 = Blockchain.nextPointer;
    private readonly bidCountMapPointer: u16 = Blockchain.nextPointer;
    private readonly highestBidMapPointer: u16 = Blockchain.nextPointer;
    private readonly highestBidderMapPointer: u16 = Blockchain.nextPointer;
    private readonly auctionDurationMapPointer: u16 = Blockchain.nextPointer;

    // ── Scalar storage ──
    private readonly listingCount: StoredU256 = new StoredU256(this.listingCountPointer, EMPTY_POINTER);
    private readonly feeBasisPoints: StoredU256 = new StoredU256(this.feeBasisPointsPointer, EMPTY_POINTER);
    private readonly nftContractAddr: StoredAddress = new StoredAddress(this.nftContractPointer);

    // ── Per-listing maps (u256 key → u256 value) ──
    private readonly sellerMap: StoredMapU256 = new StoredMapU256(this.sellerMapPointer);
    private readonly priceMap: StoredMapU256 = new StoredMapU256(this.priceMapPointer);
    private readonly statusMap: StoredMapU256 = new StoredMapU256(this.statusMapPointer);
    private readonly tokenIdMap: StoredMapU256 = new StoredMapU256(this.tokenIdMapPointer);
    private readonly expirationMap: StoredMapU256 = new StoredMapU256(this.expirationMapPointer);
    private readonly nftContractMap: StoredMapU256 = new StoredMapU256(this.nftContractMapPointer);
    private readonly bidCountMap: StoredMapU256 = new StoredMapU256(this.bidCountMapPointer);
    private readonly highestBidMap: StoredMapU256 = new StoredMapU256(this.highestBidMapPointer);
    private readonly highestBidderMap: StoredMapU256 = new StoredMapU256(this.highestBidderMapPointer);
    private readonly auctionDurationMap: StoredMapU256 = new StoredMapU256(this.auctionDurationMapPointer);

    public constructor() {
        super();
    }

    // ── Lifecycle ──

    public override onDeployment(_calldata: Calldata): void {
        this.feeBasisPoints.value = DEFAULT_FEE_BPS;
    }

    // ── Helpers ──

    private addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    private u256ToAddress(val: u256): Address {
        return Address.fromUint8Array(val.toUint8Array(true));
    }

    // ── Agent verification via cross-contract call ──

    private verifyAgent(caller: Address): void {
        const nftAddr = this.nftContractAddr.value;
        if (nftAddr.isZero()) {
            throw new Revert('NFT contract not set');
        }

        const writer = new BytesWriter(36);
        writer.writeSelector(IS_AGENT);
        writer.writeAddress(caller);

        const result = Blockchain.call(nftAddr, writer, true);
        if (!result.success) {
            throw new Revert(ERR_NOT_AGENT);
        }

        const isRegistered = result.data.readBoolean();
        if (!isRegistered) {
            throw new Revert(ERR_NOT_AGENT);
        }
    }

    // ── Cross-contract NFT transfer ──

    private transferNFT(nftContract: Address, from: Address, to: Address, tokenId: u256): void {
        const writer = new BytesWriter(100);
        writer.writeSelector(TRANSFER_FROM);
        writer.writeAddress(from);
        writer.writeAddress(to);
        writer.writeU256(tokenId);

        const result = Blockchain.call(nftContract, writer, true);
        if (!result.success) {
            throw new Revert(ERR_NFT_TRANSFER_FAILED);
        }
    }

    // ── Public methods ──

    @method(
        { name: 'nftContract', type: ABIDataTypes.ADDRESS },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'auctionDuration', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'listingId', type: ABIDataTypes.UINT256 })
    public listNFT(calldata: Calldata): BytesWriter {
        const nftContract = calldata.readAddress();
        const tokenId = calldata.readU256();
        const price = calldata.readU256();
        const auctionDuration = calldata.readU256();

        const sender = Blockchain.tx.sender;
        this.verifyAgent(sender);

        if (price == u256.Zero) {
            throw new Revert(ERR_PRICE_ZERO);
        }

        // Transfer NFT to marketplace for escrow
        this.transferNFT(nftContract, sender, Blockchain.contract.address, tokenId);

        // Create listing
        const listingId = SafeMath.add(this.listingCount.value, u256.One);
        this.listingCount.value = listingId;

        // Store listing fields
        this.sellerMap.set(listingId, this.addressToU256(sender));
        this.priceMap.set(listingId, price);
        this.statusMap.set(listingId, STATUS_ACTIVE);
        this.tokenIdMap.set(listingId, tokenId);
        this.nftContractMap.set(listingId, this.addressToU256(nftContract));
        this.auctionDurationMap.set(listingId, auctionDuration);
        this.bidCountMap.set(listingId, u256.Zero);
        this.highestBidMap.set(listingId, u256.Zero);
        this.highestBidderMap.set(listingId, u256.Zero);

        // Set expiration if auction
        if (auctionDuration != u256.Zero) {
            const currentBlock = Blockchain.block.numberU256;
            const expiration = SafeMath.add(currentBlock, auctionDuration);
            this.expirationMap.set(listingId, expiration);
        } else {
            this.expirationMap.set(listingId, u256.Zero);
        }

        const writer = new BytesWriter(32);
        writer.writeU256(listingId);
        return writer;
    }

    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns()
    public buyNow(calldata: Calldata): BytesWriter {
        const listingId = calldata.readU256();
        const sender = Blockchain.tx.sender;
        this.verifyAgent(sender);

        const status = this.statusMap.get(listingId);
        if (status != STATUS_ACTIVE) {
            throw new Revert(ERR_LISTING_NOT_ACTIVE);
        }

        const auctionDuration = this.auctionDurationMap.get(listingId);
        if (auctionDuration != u256.Zero) {
            throw new Revert(ERR_IS_AUCTION);
        }

        // Mark as sold
        this.statusMap.set(listingId, STATUS_SOLD);

        // Transfer NFT to buyer
        const tokenId = this.tokenIdMap.get(listingId);
        const nftContract = this.u256ToAddress(this.nftContractMap.get(listingId));
        this.transferNFT(nftContract, Blockchain.contract.address, sender, tokenId);

        return new BytesWriter(0);
    }

    @method(
        { name: 'listingId', type: ABIDataTypes.UINT256 },
        { name: 'bidAmount', type: ABIDataTypes.UINT256 },
    )
    @returns()
    public placeBid(calldata: Calldata): BytesWriter {
        const listingId = calldata.readU256();
        const bidAmount = calldata.readU256();
        const sender = Blockchain.tx.sender;
        this.verifyAgent(sender);

        const status = this.statusMap.get(listingId);
        if (status != STATUS_ACTIVE) {
            throw new Revert(ERR_LISTING_NOT_ACTIVE);
        }

        // Verify this is an auction listing
        const auctionDuration = this.auctionDurationMap.get(listingId);
        if (auctionDuration == u256.Zero) {
            throw new Revert(ERR_NOT_AUCTION);
        }

        // Verify auction not expired
        const expiration = this.expirationMap.get(listingId);
        if (expiration != u256.Zero) {
            const currentBlock = Blockchain.block.numberU256;
            if (currentBlock > expiration) {
                throw new Revert(ERR_LISTING_EXPIRED);
            }
        }

        // Verify not seller
        const sellerU256 = this.sellerMap.get(listingId);
        if (this.addressToU256(sender) == sellerU256) {
            throw new Revert(ERR_SELF_BID);
        }

        // Verify bid exceeds current highest
        const currentHighest = this.highestBidMap.get(listingId);
        const minPrice = this.priceMap.get(listingId);
        const minBid = currentHighest == u256.Zero ? minPrice : currentHighest;

        if (bidAmount <= minBid) {
            throw new Revert(ERR_BID_TOO_LOW);
        }

        // Update bid state
        this.highestBidMap.set(listingId, bidAmount);
        this.highestBidderMap.set(listingId, this.addressToU256(sender));
        const bidCount = this.bidCountMap.get(listingId);
        this.bidCountMap.set(listingId, SafeMath.add(bidCount, u256.One));

        return new BytesWriter(0);
    }

    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns()
    public settleListing(calldata: Calldata): BytesWriter {
        const listingId = calldata.readU256();

        const status = this.statusMap.get(listingId);
        if (status != STATUS_ACTIVE) {
            throw new Revert(ERR_LISTING_NOT_ACTIVE);
        }

        // Verify expired
        const expiration = this.expirationMap.get(listingId);
        if (expiration == u256.Zero) {
            throw new Revert(ERR_NOT_EXPIRED);
        }
        const currentBlock = Blockchain.block.numberU256;
        if (currentBlock <= expiration) {
            throw new Revert(ERR_NOT_EXPIRED);
        }

        // Verify bids exist
        const bidCount = this.bidCountMap.get(listingId);
        if (bidCount == u256.Zero) {
            throw new Revert(ERR_NO_BIDS);
        }

        // Transfer NFT to highest bidder
        const tokenId = this.tokenIdMap.get(listingId);
        const nftContract = this.u256ToAddress(this.nftContractMap.get(listingId));
        const highestBidder = this.u256ToAddress(this.highestBidderMap.get(listingId));
        this.transferNFT(nftContract, Blockchain.contract.address, highestBidder, tokenId);

        // Mark as sold
        this.statusMap.set(listingId, STATUS_SOLD);

        return new BytesWriter(0);
    }

    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns()
    public cancelListing(calldata: Calldata): BytesWriter {
        const listingId = calldata.readU256();
        const sender = Blockchain.tx.sender;

        const status = this.statusMap.get(listingId);
        if (status != STATUS_ACTIVE) {
            throw new Revert(ERR_LISTING_NOT_ACTIVE);
        }

        // Only seller can cancel
        const sellerU256 = this.sellerMap.get(listingId);
        if (this.addressToU256(sender) != sellerU256) {
            throw new Revert(ERR_NOT_SELLER);
        }

        // Cannot cancel if bids exist
        const bidCount = this.bidCountMap.get(listingId);
        if (bidCount != u256.Zero) {
            throw new Revert(ERR_HAS_BIDS);
        }

        // Return NFT to seller
        const tokenId = this.tokenIdMap.get(listingId);
        const nftContract = this.u256ToAddress(this.nftContractMap.get(listingId));
        this.transferNFT(nftContract, Blockchain.contract.address, sender, tokenId);

        // Mark as cancelled
        this.statusMap.set(listingId, STATUS_CANCELLED);

        return new BytesWriter(0);
    }

    @view
    @method({ name: 'listingId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'seller', type: ABIDataTypes.ADDRESS },
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'status', type: ABIDataTypes.UINT256 },
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'nftContract', type: ABIDataTypes.ADDRESS },
        { name: 'expiration', type: ABIDataTypes.UINT256 },
        { name: 'bidCount', type: ABIDataTypes.UINT256 },
        { name: 'highestBid', type: ABIDataTypes.UINT256 },
        { name: 'highestBidder', type: ABIDataTypes.ADDRESS },
        { name: 'auctionDuration', type: ABIDataTypes.UINT256 },
    )
    public getListing(calldata: Calldata): BytesWriter {
        const listingId = calldata.readU256();

        const seller = this.u256ToAddress(this.sellerMap.get(listingId));
        const price = this.priceMap.get(listingId);
        const status = this.statusMap.get(listingId);
        const tokenId = this.tokenIdMap.get(listingId);
        const nftContract = this.u256ToAddress(this.nftContractMap.get(listingId));
        const expiration = this.expirationMap.get(listingId);
        const bidCount = this.bidCountMap.get(listingId);
        const highestBid = this.highestBidMap.get(listingId);
        const highestBidder = this.u256ToAddress(this.highestBidderMap.get(listingId));
        const auctionDuration = this.auctionDurationMap.get(listingId);

        const writer = new BytesWriter(320);
        writer.writeAddress(seller);
        writer.writeU256(price);
        writer.writeU256(status);
        writer.writeU256(tokenId);
        writer.writeAddress(nftContract);
        writer.writeU256(expiration);
        writer.writeU256(bidCount);
        writer.writeU256(highestBid);
        writer.writeAddress(highestBidder);
        writer.writeU256(auctionDuration);

        return writer;
    }

    @view
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getListingCount(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.listingCount.value);
        return writer;
    }

    // ── Admin methods ──

    @method({ name: 'nftContract', type: ABIDataTypes.ADDRESS })
    @returns()
    public setNftContract(calldata: Calldata): BytesWriter {
        const nftContract = calldata.readAddress();
        this.onlyDeployer(Blockchain.tx.sender);

        if (nftContract.isZero()) {
            throw new Revert(ERR_ZERO_ADDRESS);
        }

        this.nftContractAddr.value = nftContract;

        return new BytesWriter(0);
    }

    @method({ name: 'basisPoints', type: ABIDataTypes.UINT256 })
    @returns()
    public setFee(calldata: Calldata): BytesWriter {
        const basisPoints = calldata.readU256();
        this.onlyDeployer(Blockchain.tx.sender);

        if (basisPoints > MAX_FEE_BPS) {
            throw new Revert(ERR_FEE_TOO_HIGH);
        }

        this.feeBasisPoints.value = basisPoints;

        return new BytesWriter(0);
    }

    @view
    @method()
    @returns({ name: 'feeBps', type: ABIDataTypes.UINT256 })
    public getFee(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.feeBasisPoints.value);
        return writer;
    }
}
