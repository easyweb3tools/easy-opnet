import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
    AgentActionResponse,
    MintRequest,
    ListRequest,
    BidRequest,
    BuyRequest,
    CancelRequest,
    DeployCollectionRequest,
    ImportCollectionRequest,
    ImportCollectionResponse,
} from '../types/index.js';
import { registerAgentOnChain } from '../agents/AgentRegistry.js';
import { verifyAgentSignature } from '../agents/AgentAuthService.js';
import { isValidAgentAddress, normalizeAgentAddress } from '../agents/AddressValidator.js';
import {
    getMissingChainConfigKeys,
    getMissingHubConfigKeys,
    getMissingWalletConfigKeys,
    readinessErrorMessage,
} from '../config/readiness.js';
import { env } from '../config/env.js';
import { getNetwork } from '../config/network.js';
import { mintNFT } from '../nft/MintService.js';
import {
    resolveCollectionContractForAgent,
    resolveCollectionForAgent,
} from '../nft/CollectionResolver.js';
import { getTokenOwner } from '../nft/TokenIndexer.js';
import { listNFT, buyNow, placeBid, cancelListing } from '../market/MarketService.js';
import { getListingState } from '../market/EscrowManager.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';
import { record } from '../store/ActivityStore.js';
import { createCollection } from '../nft/CollectionService.js';
import {
    saveImportedCollection,
    getImportedCollection,
    countImportedCollections,
} from '../store/CollectionStore.js';
import type { BitcoinInterfaceAbi } from 'opnet';
import { getProvider } from '../providers/ProviderManager.js';
import { resolveAddressWithPublicKey } from '../providers/AddressResolver.js';
import { getContract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';

const F = BitcoinAbiTypes.Function;
const OP721_PROBE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'balanceOf',
        type: F,
        inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'ownerOf',
        type: F,
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    },
];

function normalizeContractAddress(address: string): string {
    return address.trim().toLowerCase();
}

interface ContractCallResult {
    decoded?: Record<string, unknown>;
    result?: unknown;
    error?: string;
}

type ContractMethod = (...args: unknown[]) => Promise<ContractCallResult>;

function parseBalance(result: ContractCallResult): bigint {
    const rawValue = result.decoded?.balance ?? result.result ?? '0';
    return BigInt(String(rawValue ?? '0'));
}

async function probeImportedContract(
    contractAddress: string,
    agentAddress: string,
    agentPublicKey?: string,
): Promise<{ resolved: string; balance: bigint }> {
    const provider = getProvider();
    const resolved = await resolveAddressWithPublicKey(contractAddress, true);
    await provider.getCode(contractAddress, false);

    const contract = getContract(
        resolved,
        OP721_PROBE_ABI,
        provider,
        getNetwork(env.network),
    );

    const balanceOfFn = (contract as unknown as Record<string, ContractMethod>).balanceOf;
    if (!balanceOfFn) {
        throw new Error('balanceOf method not found on contract');
    }

    const agent = await resolveAddressWithPublicKey(agentAddress, false, agentPublicKey);
    const balanceResult = await balanceOfFn(agent);
    if (balanceResult.error) {
        throw new Error('Contract does not implement balanceOf/ownerOf');
    }

    const balance = parseBalance(balanceResult);
    const normalizedResolved = normalizeContractAddress(resolved.toString());
    return { resolved: normalizedResolved, balance };
}

type AgentEnv = { Variables: { agentAddress: string; agentPublicKey: string } };

export const agentRoutes = new Hono<AgentEnv>();

function buildOwnerClaimMessage(agentAddress: string, ownerAddress: string): string {
    return `I claim ownership of agent ${agentAddress} on EasyWeb3 as ${ownerAddress}`;
}

function requireChainReady(c: Context): Response | null {
    const missing = getMissingChainConfigKeys();
    if (missing.length === 0) return null;

    return c.json(
        { success: false, error: readinessErrorMessage(missing) },
        503,
    );
}

function requireWalletReady(c: Context): Response | null {
    const missing = getMissingWalletConfigKeys();
    if (missing.length === 0) return null;

    return c.json(
        { success: false, error: readinessErrorMessage(missing) },
        503,
    );
}

function requireHubReady(c: Context): Response | null {
    const missing = getMissingHubConfigKeys();
    if (missing.length === 0) return null;

    return c.json(
        { success: false, error: readinessErrorMessage(missing) },
        503,
    );
}

// POST /api/agent/register
agentRoutes.post('/register', async (c) => {
    const readinessError = requireWalletReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as {
        publicKey?: string;
        proof?: string;
        address?: string;
        ownerAddress?: string;
        ownerPublicKey?: string;
        ownerSignature?: string;
        collectionContractAddress?: string;
        collectionContractPublicKey?: string;
        collectionDeploymentTxHash?: string;
        collectionId?: string;
    };
    const verifiedPublicKey = (c.get('agentPublicKey') as string | undefined) ?? '';
    const signedAgentAddress = (c.get('agentAddress') as string | undefined) ?? '';

    if (
        !body.publicKey
        || !body.proof
        || !body.address
        || !body.ownerAddress
        || !body.ownerPublicKey
        || !body.ownerSignature
    ) {
        return c.json(
            {
                success: false,
                error: 'publicKey, proof, address, ownerAddress, ownerPublicKey, and ownerSignature are required',
            },
            400,
        );
    }

    const cleanBodyKey = body.publicKey.startsWith('0x') ? body.publicKey.slice(2).toLowerCase() : body.publicKey.toLowerCase();
    const cleanVerifiedKey = verifiedPublicKey.startsWith('0x') ? verifiedPublicKey.slice(2).toLowerCase() : verifiedPublicKey.toLowerCase();
    if (cleanVerifiedKey && cleanBodyKey !== cleanVerifiedKey) {
        return c.json({ success: false, error: 'publicKey in body does not match signed header key' }, 403);
    }

    const agentAddress = normalizeAgentAddress(body.address);
    if (!isValidAgentAddress(agentAddress)) {
        return c.json({ success: false, error: 'Invalid address format (expected bech32 taproot address)' }, 400);
    }

    if (signedAgentAddress && signedAgentAddress !== agentAddress) {
        return c.json({ success: false, error: 'Signed agent address does not match request body address' }, 403);
    }

    const ownerAddress = normalizeAgentAddress(body.ownerAddress);
    if (!isValidAgentAddress(ownerAddress)) {
        return c.json({ success: false, error: 'Invalid ownerAddress format (expected bech32 taproot address)' }, 400);
    }

    const ownerClaimMessage = buildOwnerClaimMessage(agentAddress, ownerAddress);
    const ownerVerification = await verifyAgentSignature(
        ownerClaimMessage,
        body.ownerSignature,
        body.ownerPublicKey,
    );
    if (!ownerVerification.valid) {
        return c.json(
            { success: false, error: ownerVerification.error ?? 'Invalid owner signature' },
            403,
        );
    }

    try {
        const txHash = await registerAgentOnChain(
            agentAddress,
            ownerAddress,
            ownerVerification.normalizedPublicKey,
            cleanVerifiedKey || cleanBodyKey,
            {
                contractAddress: body.collectionContractAddress,
                contractPublicKey: body.collectionContractPublicKey,
                deploymentTxHash: body.collectionDeploymentTxHash,
                collectionId: body.collectionId,
            },
        );

        const response: AgentActionResponse = { txHash };
        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Registration failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

async function handleCreateCollection(c: Context): Promise<Response> {
    const readinessError = requireHubReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as DeployCollectionRequest;
    const agentAddress = c.get('agentAddress');
    const verifiedPublicKey = (c.get('agentPublicKey') as string | undefined) ?? '';

    if (!body.address || !body.name || !body.symbol || !body.maxSupply) {
        return c.json(
            { success: false, error: 'address, name, symbol, and maxSupply are required' },
            400,
        );
    }

    const name = body.name.trim();
    const symbol = body.symbol.trim();
    if (!name || !symbol) {
        return c.json({ success: false, error: 'name and symbol cannot be empty' }, 400);
    }

    let maxSupply: bigint;
    try {
        maxSupply = BigInt(body.maxSupply);
    } catch {
        return c.json({ success: false, error: 'maxSupply must be a valid integer string' }, 400);
    }

    if (maxSupply <= 0n) {
        return c.json({ success: false, error: 'maxSupply must be greater than zero' }, 400);
    }

    if (body.publicKey && verifiedPublicKey) {
        const cleanBodyKey = body.publicKey.startsWith('0x')
            ? body.publicKey.slice(2).toLowerCase()
            : body.publicKey.toLowerCase();
        const cleanVerifiedKey = verifiedPublicKey.startsWith('0x')
            ? verifiedPublicKey.slice(2).toLowerCase()
            : verifiedPublicKey.toLowerCase();
        if (cleanBodyKey !== cleanVerifiedKey) {
            return c.json(
                { success: false, error: 'publicKey in body does not match signed header key' },
                403,
            );
        }
    }

    try {
        const result = await createCollection({
            address: body.address,
            publicKey: verifiedPublicKey || body.publicKey,
            name,
            symbol,
            maxSupply: body.maxSupply,
            baseURI: body.baseURI ?? '',
            collectionBanner: body.collectionBanner ?? '',
            collectionIcon: body.collectionIcon ?? '',
            collectionWebsite: body.collectionWebsite ?? '',
            collectionDescription: body.collectionDescription ?? '',
        });

        record({
            type: 'mint',
            agent: agentAddress,
            tokenId: '',
            nftName: name,
            txHash: result.txHash ?? result.deploymentTxHash,
        });

        return c.json({ success: true, data: result });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Create collection failed';
        return c.json({ success: false, error: msg }, 500);
    }
}

// POST /api/agent/create-collection
agentRoutes.post('/create-collection', handleCreateCollection);

// POST /api/agent/deploy-collection (backward compatibility alias)
agentRoutes.post('/deploy-collection', handleCreateCollection);

async function handleImportCollection(c: Context): Promise<Response> {
    const readinessError = requireWalletReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as ImportCollectionRequest;
    const agentAddress = c.get('agentAddress');
    const verifiedPublicKey = (c.get('agentPublicKey') as string | undefined) ?? '';

    if (!body.address || !body.nftContractAddress) {
        return c.json(
            { success: false, error: 'address and nftContractAddress are required' },
            400,
        );
    }

    if (!agentAddress || normalizeAgentAddress(body.address) !== agentAddress) {
        return c.json({ success: false, error: 'Signed agent address mismatch' }, 403);
    }

    const normalizedAgent = normalizeAgentAddress(body.address);
    const normalizedContract = normalizeContractAddress(body.nftContractAddress);
    const normalizedHub = normalizeContractAddress(CONTRACT_ADDRESSES.nftHub);
    if (normalizedHub && normalizedContract === normalizedHub) {
        return c.json(
            {
                success: false,
                error: 'Use /api/agent/create-collection to work with the platform collection',
            },
            400,
        );
    }

    const existingCount = await countImportedCollections(normalizedAgent);
    if (existingCount >= 10) {
        return c.json(
            { success: false, error: 'Import limit reached (max 10 collections)' },
            429,
        );
    }

    try {
        const { resolved, balance } = await probeImportedContract(
            normalizedContract,
            normalizedAgent,
            verifiedPublicKey || undefined,
        );

        if (balance <= 0n) {
            return c.json(
                { success: false, error: 'Agent must own at least one token on this contract' },
                400,
            );
        }

        const record = await saveImportedCollection({
            id: '',
            agentAddress: normalizedAgent,
            nftContractAddress: resolved,
            name: body.name?.trim() ?? '',
            symbol: body.symbol?.trim() ?? '',
            collectionBanner: body.collectionBanner?.trim() ?? '',
            collectionIcon: body.collectionIcon?.trim() ?? '',
            collectionWebsite: body.collectionWebsite?.trim() ?? '',
            collectionDescription: body.collectionDescription?.trim() ?? '',
            verified: true,
            importedAt: new Date().toISOString(),
        });

        const tokenCount = balance > BigInt(Number.MAX_SAFE_INTEGER)
            ? Number.MAX_SAFE_INTEGER
            : Number(balance);

        const response: ImportCollectionResponse = {
            collectionId: record.id,
            nftContractAddress: resolved,
            verified: true,
            tokenCount,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Import failed';
        return c.json({ success: false, error: msg }, 400);
    }
}

agentRoutes.post('/import-collection', handleImportCollection);

// POST /api/agent/mint
agentRoutes.post('/mint', async (c) => {
    const readinessError = requireWalletReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as MintRequest;
    const agentAddress = c.get('agentAddress');
    const verifiedPublicKey = (c.get('agentPublicKey') as string | undefined) ?? '';

    if (!body.metadata?.name || !body.metadata?.description) {
        return c.json({ success: false, error: 'Metadata name and description are required' }, 400);
    }

    try {
        const resolvedCollection = await resolveCollectionForAgent(
            agentAddress,
            {
                contractAddress: body.collectionContractAddress,
                contractPublicKey: body.collectionContractPublicKey,
                deploymentTxHash: body.collectionDeploymentTxHash,
                collectionId: body.collectionId,
            },
        );
        const nftContractAddress = resolvedCollection.contractAddress;
        const recipient = body.recipient ?? agentAddress;
        const recipientPublicKey = body.recipientPublicKey ?? (body.recipient ? undefined : verifiedPublicKey);
        const result = await mintNFT(nftContractAddress, recipient, {
            name: body.metadata.name,
            description: body.metadata.description,
            imageUrl: body.metadata.imageUrl ?? '',
            attributes: body.metadata.attributes ?? [],
        }, recipientPublicKey, resolvedCollection.collectionId);

        record({
            type: 'mint',
            agent: agentAddress,
            tokenId: result.tokenId ?? '',
            nftName: body.metadata.name,
            txHash: result.txHash,
        });

        let response: AgentActionResponse = { txHash: result.txHash };
        if (result.tokenId) {
            response = { ...response, tokenId: result.tokenId };
        }

        // If listImmediately, also list the NFT
        if (body.listImmediately && body.listPrice && result.tokenId) {
            try {
                const listResult = await listNFT(
                    nftContractAddress,
                    result.tokenId,
                    body.listPrice,
                );
                record({
                    type: 'list',
                    agent: agentAddress,
                    tokenId: result.tokenId,
                    nftName: body.metadata.name,
                    listingId: listResult.listingId,
                    amount: body.listPrice,
                    txHash: listResult.txHash,
                });
                response = { ...response, listingId: listResult.listingId };
            } catch (listErr) {
                console.error('Auto-list after mint failed:', listErr);
            }
        } else if (body.listImmediately && !result.tokenId) {
            console.warn('Skipping auto-list: tokenId not indexed yet for newly minted NFT');
        }

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Mint failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/list
agentRoutes.post('/list', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as ListRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.tokenId || !body.price) {
        return c.json({ success: false, error: 'tokenId and price are required' }, 400);
    }

    if (BigInt(body.price) <= 0n) {
        return c.json({ success: false, error: 'Price must be greater than zero' }, 400);
    }

    try {
        let nftContractAddress: string;
        if (body.nftContractAddress) {
            const normalizedContract = normalizeContractAddress(body.nftContractAddress);
            const imported = await getImportedCollection(agentAddress, normalizedContract);
            if (!imported) {
                return c.json(
                    {
                        success: false,
                        error: 'Collection not imported. Call /api/agent/import-collection first.',
                    },
                    400,
                );
            }
            nftContractAddress = imported.nftContractAddress;
        } else {
            nftContractAddress = await resolveCollectionContractForAgent(agentAddress);
        }

        const owner = await getTokenOwner(body.tokenId, nftContractAddress);
        if (!owner || normalizeAgentAddress(owner) !== agentAddress) {
            return c.json(
                { success: false, error: 'Agent does not own this token' },
                403,
            );
        }
        const result = await listNFT(
            nftContractAddress,
            body.tokenId,
            body.price,
            body.auctionDuration ?? 0,
        );

        record({
            type: 'list',
            agent: agentAddress,
            tokenId: body.tokenId,
            listingId: result.listingId,
            amount: body.price,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
            listingId: result.listingId,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'List failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/bid
agentRoutes.post('/bid', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as BidRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.listingId || !body.amount) {
        return c.json({ success: false, error: 'listingId and amount are required' }, 400);
    }

    try {
        const result = await placeBid(body.listingId, body.amount);

        record({
            type: 'bid',
            agent: agentAddress,
            listingId: body.listingId,
            amount: body.amount,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
            bidId: `bid-${Date.now().toString(36)}`,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bid failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/buy
agentRoutes.post('/buy', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as BuyRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.listingId) {
        return c.json({ success: false, error: 'listingId is required' }, 400);
    }

    try {
        // Lookup listing to get seller and price
        const listing = await getListingState(body.listingId);
        if (!listing) {
            return c.json({ success: false, error: 'Listing not found' }, 404);
        }
        if (listing.status !== 1) {
            return c.json({ success: false, error: 'Listing is not active' }, 400);
        }

        const result = await buyNow(body.listingId, listing.seller, listing.price);

        record({
            type: 'sale',
            agent: agentAddress,
            tokenId: listing.tokenId,
            listingId: body.listingId,
            amount: listing.price,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Buy failed';
        return c.json({ success: false, error: msg }, 500);
    }
});

// POST /api/agent/cancel
agentRoutes.post('/cancel', async (c) => {
    const readinessError = requireChainReady(c);
    if (readinessError) return readinessError;

    const body = await c.req.json() as CancelRequest;
    const agentAddress = c.get('agentAddress');

    if (!body.listingId) {
        return c.json({ success: false, error: 'listingId is required' }, 400);
    }

    try {
        const result = await cancelListing(body.listingId);

        record({
            type: 'cancel',
            agent: agentAddress,
            listingId: body.listingId,
            txHash: result.txHash,
        });

        const response: AgentActionResponse = {
            txHash: result.txHash,
        };

        return c.json({ success: true, data: response });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cancel failed';
        return c.json({ success: false, error: msg }, 500);
    }
});
