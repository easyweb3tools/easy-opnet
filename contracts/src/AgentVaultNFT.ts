import {
    Address,
    AddressMemoryMap,
    Blockchain,
    BytesWriter,
    Calldata,
    EMPTY_POINTER,
    OP721,
    OP721InitParameters,
    Revert,
    SafeMath,
    StoredU256,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

import { ERR_AGENT_ALREADY_REGISTERED, ERR_AGENT_NOT_FOUND, ERR_NOT_AGENT, ERR_NOT_DEPLOYER } from './lib/Errors';

@final
export class AgentVaultNFT extends OP721 {
    // ── Storage pointers (allocated after OP721 base) ──
    private readonly agentRegistryPointer: u16 = Blockchain.nextPointer;
    private readonly agentCountPointer: u16 = Blockchain.nextPointer;
    private readonly nextTokenIdPointer: u16 = Blockchain.nextPointer;

    // ── Storage instances (initialized inline for AS compatibility) ──
    private readonly agentRegistry: AddressMemoryMap = new AddressMemoryMap(this.agentRegistryPointer);
    private readonly agentCount: StoredU256 = new StoredU256(this.agentCountPointer, EMPTY_POINTER);
    private readonly nextTokenId: StoredU256 = new StoredU256(this.nextTokenIdPointer, EMPTY_POINTER);

    public constructor() {
        super();
    }

    // ── Lifecycle ──

    public override onDeployment(_calldata: Calldata): void {
        this.instantiate(
            new OP721InitParameters(
                'AgentVault',
                'AVNFT',
                'ipfs://',
                u256.fromU64(100000),
            ),
        );

        // Start token IDs at 1
        this.nextTokenId.value = u256.One;
    }

    // ── Public methods ──

    @method({ name: 'to', type: ABIDataTypes.ADDRESS }, { name: 'tokenURI', type: ABIDataTypes.STRING })
    @returns({ name: 'tokenId', type: ABIDataTypes.UINT256 })
    public mint(calldata: Calldata): BytesWriter {
        const to = calldata.readAddress();
        const tokenURI = calldata.readStringWithLength();

        this._onlyAgent(Blockchain.tx.sender);

        const tokenId = this.nextTokenId.value;
        this._mint(to, tokenId);
        this._setTokenURI(tokenId, tokenURI);

        this.nextTokenId.value = SafeMath.add(tokenId, u256.One);

        const writer = new BytesWriter(32);
        writer.writeU256(tokenId);
        return writer;
    }

    @method({ name: 'agent', type: ABIDataTypes.ADDRESS })
    @returns()
    public registerAgent(calldata: Calldata): BytesWriter {
        const agent = calldata.readAddress();

        this.onlyDeployer(Blockchain.tx.sender);

        const existing = this.agentRegistry.get(agent);
        if (existing != u256.Zero) {
            throw new Revert(ERR_AGENT_ALREADY_REGISTERED);
        }

        this.agentRegistry.set(agent, u256.One);
        this.agentCount.value = SafeMath.add(this.agentCount.value, u256.One);

        return new BytesWriter(0);
    }

    @method({ name: 'agent', type: ABIDataTypes.ADDRESS })
    @returns()
    public revokeAgent(calldata: Calldata): BytesWriter {
        const agent = calldata.readAddress();

        this.onlyDeployer(Blockchain.tx.sender);

        const existing = this.agentRegistry.get(agent);
        if (existing == u256.Zero) {
            throw new Revert(ERR_AGENT_NOT_FOUND);
        }

        this.agentRegistry.set(agent, u256.Zero);
        this.agentCount.value = SafeMath.sub(this.agentCount.value, u256.One);

        return new BytesWriter(0);
    }

    @view
    @method({ name: 'account', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'result', type: ABIDataTypes.BOOL })
    public isAgent(calldata: Calldata): BytesWriter {
        const account = calldata.readAddress();

        const registered = this.agentRegistry.get(account);

        const writer = new BytesWriter(1);
        writer.writeBoolean(registered != u256.Zero);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getAgentCount(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.agentCount.value);
        return writer;
    }

    @view
    @method()
    @returns({ name: 'tokenId', type: ABIDataTypes.UINT256 })
    public getNextTokenId(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.nextTokenId.value);
        return writer;
    }

    // ── Guards ──

    private _onlyAgent(caller: Address): void {
        const isRegistered = this.agentRegistry.get(caller);
        if (isRegistered == u256.Zero) {
            throw new Revert(ERR_NOT_AGENT);
        }
    }
}
