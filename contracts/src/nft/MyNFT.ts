import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    OP721,
    OP721InitParameters,
    Potential,
    Revert,
    SafeMath,
    StoredBoolean,
    StoredMapU256,
    StoredString,
    StoredU256,
    StoredU64Array,
    TransactionOutput,
    U256_BYTE_LENGTH,
    U32_BYTE_LENGTH,
    U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import {
    MintStatusChangedEvent,
    ReservationClaimedEvent,
    ReservationCreatedEvent,
    ReservationExpiredEvent,
} from './events/Reserved';

@final
class PurgeResult {
    constructor(
        public totalPurged: u256,
        public blocksProcessed: u32,
    ) { }
}

const treasuryAddressPointer: u16 = Blockchain.nextPointer;
const reservationBlockPointer: u16 = Blockchain.nextPointer;
const reservationAmountPointer: u16 = Blockchain.nextPointer;
const blockReservedAmountPointer: u16 = Blockchain.nextPointer;
const totalActiveReservedPointer: u16 = Blockchain.nextPointer;
const blocksWithReservationsPointer: u16 = Blockchain.nextPointer;
const mintEnabledPointer: u16 = Blockchain.nextPointer;
const agentRegistryPointer: u16 = Blockchain.nextPointer;
const agentOwnerPointer: u16 = Blockchain.nextPointer;
const agentCountPointer: u16 = Blockchain.nextPointer;

@final
export class MyNFT extends OP721 {
    // Constants
    private static readonly MINT_PRICE: u64 = 100000; // 0.001 BTC per NFT
    private static readonly RESERVATION_FEE_PERCENT: u64 = 15; // 15% upfront
    private static readonly MIN_RESERVATION_FEE: u64 = 1000; // Minimum 1000 sats
    private static readonly RESERVATION_BLOCKS: u64 = 5; // 5 blocks to pay
    private static readonly GRACE_BLOCKS: u64 = 1; // 1 block grace period
    private static readonly MAX_RESERVATION_AMOUNT: u32 = 20; // Max per reservation
    private static readonly MAX_BLOCKS_TO_PURGE: u32 = 10; // Max blocks per purge

    private readonly treasuryAddress: StoredString;
    private readonly mintEnabled: StoredBoolean;
    private readonly agentRegistry: StoredMapU256; // agentAddress -> bool
    private readonly agentOwner: StoredMapU256; // agentAddress -> ownerAddress
    private readonly agentCount: StoredU256;

    // User reservations
    private userReservationBlock: StoredMapU256; // address -> block number when reserved
    private userReservationAmount: StoredMapU256; // address -> amount reserved

    // Block tracking
    private blockReservedAmount: StoredMapU256; // block number -> total reserved in that block
    private totalActiveReserved: StoredU256; // Global active reservations counter

    public constructor() {
        super();

        this.userReservationBlock = new StoredMapU256(reservationBlockPointer);
        this.userReservationAmount = new StoredMapU256(reservationAmountPointer);
        this.blockReservedAmount = new StoredMapU256(blockReservedAmountPointer);
        this.totalActiveReserved = new StoredU256(totalActiveReservedPointer, EMPTY_POINTER);

        this.treasuryAddress = new StoredString(treasuryAddressPointer);
        this.mintEnabled = new StoredBoolean(mintEnabledPointer, false);
        this.agentRegistry = new StoredMapU256(agentRegistryPointer);
        this.agentOwner = new StoredMapU256(agentOwnerPointer);
        this.agentCount = new StoredU256(agentCountPointer, EMPTY_POINTER);
    }

    private _blocksWithReservations: Potential<StoredU64Array> = null; // Sorted list of blocks with reservations

    public get blocksWithReservations(): StoredU64Array {
        if (this._blocksWithReservations === null) {
            this._blocksWithReservations = new StoredU64Array(
                blocksWithReservationsPointer,
                EMPTY_POINTER,
            );
        }

        return this._blocksWithReservations as StoredU64Array;
    }

    public override onDeployment(calldata: Calldata): void {
        const name: string = calldata.readStringWithLength();
        const symbol: string = calldata.readStringWithLength();
        const maxSupply: u256 = calldata.readU256();
        const baseURI: string = calldata.readStringWithLength();
        const collectionBanner: string = calldata.readStringWithLength();
        const collectionIcon: string = calldata.readStringWithLength();
        const collectionWebsite: string = calldata.readStringWithLength();
        const collectionDescription: string = calldata.readStringWithLength();

        if (maxSupply.isZero()) {
            throw new Revert('maxSupply must be > 0');
        }

        this.instantiate(
            new OP721InitParameters(
                name,
                symbol,
                baseURI,
                maxSupply,
                collectionBanner,
                collectionIcon,
                collectionWebsite,
                collectionDescription,
            ),
        );

        this.treasuryAddress.value = Blockchain.tx.origin.p2tr();
        this.mintEnabled.value = false; // Start with minting disabled
    }

    @method({ name: 'enabled', type: ABIDataTypes.BOOL })
    @emit('MintStatusChanged')
    public setMintEnabled(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const enabled: boolean = calldata.readBoolean();
        this.mintEnabled.value = enabled;

        // Emit event for transparency
        this.emitEvent(new MintStatusChangedEvent(enabled));

        return new BytesWriter(0);
    }

    @method()
    @returns({ name: 'enabled', type: ABIDataTypes.BOOL })
    public isMintEnabled(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(<boolean>this.mintEnabled.value);
        return response;
    }

    @method({ name: 'agent', type: ABIDataTypes.ADDRESS })
    public registerAgent(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const agentAddress: Address = calldata.readAddress();
        const agentKey: u256 = this._u256FromAddress(agentAddress);

        if (this.agentRegistry.get(agentKey).isZero()) {
            this.agentRegistry.set(agentKey, u256.One);
            this.agentCount.value = SafeMath.add(this.agentCount.value, u256.One);
        }

        if (this.agentOwner.get(agentKey).isZero()) {
            this.agentOwner.set(agentKey, agentKey);
        }

        return new BytesWriter(0);
    }

    @method(
        { name: 'agent', type: ABIDataTypes.ADDRESS },
        { name: 'owner', type: ABIDataTypes.ADDRESS },
    )
    public registerAgentWithOwner(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const agentAddress: Address = calldata.readAddress();
        const ownerAddress: Address = calldata.readAddress();
        const agentKey: u256 = this._u256FromAddress(agentAddress);
        const ownerKey: u256 = this._u256FromAddress(ownerAddress);

        if (this.agentRegistry.get(agentKey).isZero()) {
            this.agentRegistry.set(agentKey, u256.One);
            this.agentCount.value = SafeMath.add(this.agentCount.value, u256.One);
        }

        this.agentOwner.set(agentKey, ownerKey);

        return new BytesWriter(0);
    }

    @method({ name: 'agent', type: ABIDataTypes.ADDRESS })
    public revokeAgent(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const agentAddress: Address = calldata.readAddress();
        const agentKey: u256 = this._u256FromAddress(agentAddress);

        if (!this.agentRegistry.get(agentKey).isZero()) {
            this.agentRegistry.set(agentKey, u256.Zero);
            this.agentOwner.set(agentKey, u256.Zero);
            if (!this.agentCount.value.isZero()) {
                this.agentCount.value = SafeMath.sub(this.agentCount.value, u256.One);
            }
        }

        return new BytesWriter(0);
    }

    @method({ name: 'account', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'result', type: ABIDataTypes.BOOL })
    public isAgent(calldata: Calldata): BytesWriter {
        const account: Address = calldata.readAddress();
        const accountKey: u256 = this._u256FromAddress(account);
        const response: BytesWriter = new BytesWriter(1);
        response.writeBoolean(!this.agentRegistry.get(accountKey).isZero());
        return response;
    }

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getAgentCount(_: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.agentCount.value);
        return response;
    }

    @method({ name: 'agent', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
    public getAgentOwner(calldata: Calldata): BytesWriter {
        const agentAddress: Address = calldata.readAddress();
        const agentKey: u256 = this._u256FromAddress(agentAddress);
        const ownerAddress: Address = this._addressFromU256(this.agentOwner.get(agentKey));

        const response: BytesWriter = new BytesWriter(32);
        response.writeAddress(ownerAddress);
        return response;
    }

    @method(
        {
            name: 'addresses',
            type: ABIDataTypes.ARRAY_OF_ADDRESSES,
        },
        {
            name: 'amounts',
            type: ABIDataTypes.ARRAY_OF_UINT8,
        },
    )
    @emit('Transferred')
    public airdrop(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const addresses: Address[] = calldata.readAddressArray();
        const amounts: u8[] = calldata.readU8Array();

        if (addresses.length !== amounts.length || addresses.length === 0) {
            throw new Revert('Mismatched or empty arrays');
        }

        let totalToMint: u32 = 0;

        const addressLength: u32 = u32(addresses.length);
        for (let i: u32 = 0; i < addressLength; i++) {
            totalToMint += amounts[i];
        }

        if (totalToMint === 0) {
            throw new Revert('Total mint amount is zero');
        }

        // Check supply availability
        const currentSupply: u256 = this._totalSupply.value;
        const available: u256 = SafeMath.sub(
            this.maxSupply,
            SafeMath.add(currentSupply, this.totalActiveReserved.value),
        );

        if (u256.fromU32(totalToMint) > available) {
            throw new Revert('Insufficient supply available');
        }

        // Mint NFTs
        const startTokenId: u256 = this._nextTokenId.value;
        let mintedSoFar: u32 = 0;

        for (let i: u32 = 0; i < addressLength; i++) {
            const addr: Address = addresses[i];
            const amount: u32 = amounts[i];

            if (amount === 0) continue;

            for (let j: u32 = 0; j < amount; j++) {
                const tokenId: u256 = SafeMath.add(startTokenId, u256.fromU32(mintedSoFar));
                this._mint(addr, tokenId);
                mintedSoFar++;
            }
        }

        this._nextTokenId.value = SafeMath.add(startTokenId, u256.fromU32(mintedSoFar));

        return new BytesWriter(0);
    }

    /**
     * @notice Reserve NFTs by paying 15% upfront fee (minimum 1000 sats total)
     * @dev Reservations expire after RESERVATION_BLOCKS + GRACE_BLOCKS (6 blocks total)
     * @param calldata
     */
    @method({
        name: 'quantity',
        type: ABIDataTypes.UINT256,
    })
    @emit('ReservationCreated')
    @returns(
        { name: 'remainingPayment', type: ABIDataTypes.UINT64 },
        { name: 'reservationBlock', type: ABIDataTypes.UINT64 },
    )
    public reserve(calldata: Calldata): BytesWriter {
        // Check if minting is enabled
        if (!this.mintEnabled.value) {
            throw new Revert('Minting is disabled');
        }

        // Auto-purge expired reservations first
        this.autoPurgeExpired();

        const quantity: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        if (quantity.isZero() || quantity > u256.fromU32(MyNFT.MAX_RESERVATION_AMOUNT)) {
            throw new Revert('Invalid quantity: 1-20 only');
        }

        const senderKey: u256 = this._u256FromAddress(sender);

        // Check if user has existing reservation (expired or not)
        const existingBlock: u256 = this.userReservationBlock.get(senderKey);

        if (!existingBlock.isZero()) {
            const currentBlock: u64 = Blockchain.block.number;
            const totalExpiry: u64 = SafeMath.add64(
                SafeMath.add64(existingBlock.toU64(), MyNFT.RESERVATION_BLOCKS),
                MyNFT.GRACE_BLOCKS,
            );

            if (currentBlock <= totalExpiry) {
                throw new Revert('Active reservation exists');
            }
            // If expired, we just overwrite it below - no cleanup
        }

        const qty: u64 = quantity.toU64();
        const totalCost: u64 = SafeMath.mul64(MyNFT.MINT_PRICE, qty);
        const calculatedFee: u64 = SafeMath.div64(
            SafeMath.mul64(totalCost, MyNFT.RESERVATION_FEE_PERCENT),
            100,
        );

        // Apply minimum fee of 1000 sats
        const reservationFee: u64 =
            calculatedFee < MyNFT.MIN_RESERVATION_FEE ? MyNFT.MIN_RESERVATION_FEE : calculatedFee;

        // Validate payment
        if (!this.validatePayment(reservationFee)) {
            throw new Revert('Insufficient reservation fee');
        }

        // Check supply availability
        const currentSupply: u256 = this._totalSupply.value;
        const available: u256 = SafeMath.sub(
            this.maxSupply,
            SafeMath.add(currentSupply, this.totalActiveReserved.value),
        );

        if (quantity > available) {
            throw new Revert('Insufficient supply available');
        }

        // Store reservation (overwrite any expired data)
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);
        this.userReservationBlock.set(senderKey, currentBlock);
        this.userReservationAmount.set(senderKey, quantity);

        // Update block reserved amount
        const currentBlockReserved: u256 = this.blockReservedAmount.get(currentBlock);
        this.blockReservedAmount.set(currentBlock, SafeMath.add(currentBlockReserved, quantity));

        // Track this block if new
        this.trackBlockWithReservation(Blockchain.block.number);

        // Update total active reserved
        this.totalActiveReserved.value = SafeMath.add(this.totalActiveReserved.value, quantity);

        // Emit event
        this.emitEvent(
            new ReservationCreatedEvent(sender, quantity, Blockchain.block.number, reservationFee),
        );

        const remainingPayment: u64 = SafeMath.sub64(totalCost, reservationFee);
        const response: BytesWriter = new BytesWriter(8 + U256_BYTE_LENGTH);
        response.writeU64(remainingPayment);
        response.writeU64(currentBlock.toU64());

        return response;
    }

    /**
     * @notice Claims reserved NFTs by paying the remaining balance
     * @dev Must be called within RESERVATION_BLOCKS + GRACE_BLOCKS (6 blocks total)
     *      Block 0: reservation created
     *      Blocks 1-5: standard claim period
     *      Block 6: grace period (last chance to claim)
     *      Block 7+: expired, reservation can be purged
     */
    @method()
    @emit('ReservationClaimed')
    @emit('Transferred')
    public claim(_: Calldata): BytesWriter {
        const sender: Address = Blockchain.tx.sender;
        const senderKey: u256 = this._u256FromAddress(sender);

        // Get reservation
        const reservedBlock: u256 = this.userReservationBlock.get(senderKey);
        const reservedAmount: u256 = this.userReservationAmount.get(senderKey);

        if (reservedBlock.isZero() || reservedAmount.isZero()) {
            throw new Revert('No reservation found');
        }

        // Check expiry INCLUDING grace period
        const currentBlock: u64 = Blockchain.block.number;
        const claimDeadline: u64 = SafeMath.add64(
            SafeMath.add64(reservedBlock.toU64(), MyNFT.RESERVATION_BLOCKS),
            MyNFT.GRACE_BLOCKS,
        );

        if (currentBlock > claimDeadline) {
            throw new Revert('Reservation expired');
        }

        // Calculate exact payment needed with SafeMath
        const qty: u64 = reservedAmount.toU64();
        const totalCost: u64 = SafeMath.mul64(MyNFT.MINT_PRICE, qty);
        const calculatedFee: u64 = SafeMath.div64(
            SafeMath.mul64(totalCost, MyNFT.RESERVATION_FEE_PERCENT),
            100,
        );
        const alreadyPaid: u64 =
            calculatedFee < MyNFT.MIN_RESERVATION_FEE ? MyNFT.MIN_RESERVATION_FEE : calculatedFee;
        const exactPaymentNeeded: u64 = SafeMath.sub64(totalCost, alreadyPaid);

        // Validate EXACT payment (or more)
        const paymentReceived: u64 = this.getExactPayment();
        if (paymentReceived < exactPaymentNeeded) {
            throw new Revert('Insufficient payment - funds lost');
        }

        // Mint NFTs
        const startTokenId: u256 = this._nextTokenId.value;
        const amountToMint: u32 = reservedAmount.toU32();
        for (let i: u32 = 0; i < amountToMint; i++) {
            const tokenId: u256 = SafeMath.add(startTokenId, u256.fromU32(i));
            this._mint(sender, tokenId);
        }
        this._nextTokenId.value = SafeMath.add(startTokenId, reservedAmount);

        // Reduce block reserved amount
        const blockReserved: u256 = this.blockReservedAmount.get(reservedBlock);
        const newBlockReserved: u256 = SafeMath.sub(blockReserved, reservedAmount);
        this.blockReservedAmount.set(reservedBlock, newBlockReserved);

        // Update total and clear user reservation
        this.totalActiveReserved.value = SafeMath.sub(
            this.totalActiveReserved.value,
            reservedAmount,
        );
        this.userReservationBlock.set(senderKey, u256.Zero);
        this.userReservationAmount.set(senderKey, u256.Zero);

        // Emit event
        this.emitEvent(new ReservationClaimedEvent(sender, reservedAmount, startTokenId));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 2);
        response.writeU256(startTokenId);
        response.writeU256(reservedAmount);
        return response;
    }

    @method()
    @emit('ReservationExpired')
    public purgeExpired(_: Calldata): BytesWriter {
        const result: PurgeResult = this.autoPurgeExpired();

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + U32_BYTE_LENGTH);
        response.writeU256(result.totalPurged);
        response.writeU32(result.blocksProcessed);
        return response;
    }

    @method()
    @returns(
        { name: 'minted', type: ABIDataTypes.UINT256 },
        { name: 'reserved', type: ABIDataTypes.UINT256 },
        { name: 'available', type: ABIDataTypes.UINT256 },
        { name: 'maxSupply', type: ABIDataTypes.UINT256 },
        { name: 'blocksWithReservations', type: ABIDataTypes.UINT32 },
        { name: 'pricePerToken', type: ABIDataTypes.UINT64 },
        { name: 'reservationFeePercent', type: ABIDataTypes.UINT64 },
        { name: 'minReservationFee', type: ABIDataTypes.UINT64 },
    )
    public getStatus(_: Calldata): BytesWriter {
        // Auto-purge expired reservations to show accurate available supply
        this.autoPurgeExpired();

        const minted: u256 = this._totalSupply.value;
        const reserved: u256 = this.totalActiveReserved.value;
        const available: u256 = SafeMath.sub(this.maxSupply, SafeMath.add(minted, reserved));

        const response: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH * 4 + U32_BYTE_LENGTH + U64_BYTE_LENGTH * 3,
        );
        response.writeU256(minted);
        response.writeU256(reserved);
        response.writeU256(available);
        response.writeU256(this.maxSupply);
        response.writeU32(this.blocksWithReservations.getLength());
        response.writeU64(MyNFT.MINT_PRICE);
        response.writeU64(MyNFT.RESERVATION_FEE_PERCENT);
        response.writeU64(MyNFT.MIN_RESERVATION_FEE);
        return response;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'uri', type: ABIDataTypes.STRING },
    )
    @emit('URI')
    public setTokenURI(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const tokenId: u256 = calldata.readU256();
        const uri: string = calldata.readStringWithLength();

        this._setTokenURI(tokenId, uri);

        return new BytesWriter(0);
    }

    private autoPurgeExpired(): PurgeResult {
        const cutoffBlock: u64 = SafeMath.sub64(
            Blockchain.block.number,
            SafeMath.add64(MyNFT.RESERVATION_BLOCKS, MyNFT.GRACE_BLOCKS),
        );

        let totalPurged: u256 = u256.Zero;
        let blocksProcessed: u32 = 0;

        // Process blocks from the tracked list
        while (
            this.blocksWithReservations.getLength() > 0 &&
            blocksProcessed < MyNFT.MAX_BLOCKS_TO_PURGE
        ) {
            const oldestBlock: u64 = this.blocksWithReservations.get(0);

            // Stop if we reach blocks that aren't expired yet
            if (oldestBlock > cutoffBlock) {
                break;
            }

            const blockKey: u256 = u256.fromU64(oldestBlock);
            const blockReserved: u256 = this.blockReservedAmount.get(blockKey);

            if (!blockReserved.isZero()) {
                // Add back to available supply
                totalPurged = SafeMath.add(totalPurged, blockReserved);
                this.totalActiveReserved.value = SafeMath.sub(
                    this.totalActiveReserved.value,
                    blockReserved,
                );
                this.blockReservedAmount.set(blockKey, u256.Zero);

                // Emit event
                this.emitEvent(new ReservationExpiredEvent(oldestBlock, blockReserved));
            }

            // Remove this block from tracking
            this.blocksWithReservations.shift();
            blocksProcessed++;
        }

        if (blocksProcessed > 0) {
            this.blocksWithReservations.save();
        }

        return new PurgeResult(totalPurged, blocksProcessed);
    }

    private trackBlockWithReservation(blockNumber: u64): void {
        const length: u32 = this.blocksWithReservations.getLength();

        // Only add if not already present (blocks are sorted)
        if (length === 0 || this.blocksWithReservations.get(length - 1) !== blockNumber) {
            this.blocksWithReservations.push(blockNumber);
            this.blocksWithReservations.save();
        }
    }

    private validatePayment(requiredAmount: u64): boolean {
        const totalPaid: u64 = this.getExactPayment();
        return totalPaid >= requiredAmount;
    }

    private getExactPayment(): u64 {
        const outputs: TransactionOutput[] = Blockchain.tx.outputs;
        let totalPaid: u64 = 0;

        for (let i: i32 = 0; i < outputs.length; i++) {
            const output: TransactionOutput = outputs[i];

            if (!output.to) continue;

            if (output.to === this.treasuryAddress.value) {
                totalPaid = SafeMath.add64(totalPaid, output.value);
            }
        }

        return totalPaid;
    }
}
