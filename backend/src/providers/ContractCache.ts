import { getContract, type IOP721Contract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';
import { getProvider } from './ProviderManager.js';
import { getNetwork } from '../config/network.js';
import { env } from '../config/env.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';
import { resolveAddressWithPublicKey } from './AddressResolver.js';
import { getCollectionByContract } from '../store/CollectionStore.js';

const F = BitcoinAbiTypes.Function;

const NFT_ABI: BitcoinInterfaceAbi = [
    { name: 'mint', type: F, inputs: [{ name: 'to', type: ABIDataTypes.ADDRESS }, { name: 'tokenURI', type: ABIDataTypes.STRING }], outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }] },
    { name: 'airdrop', type: F, inputs: [{ name: 'addresses', type: ABIDataTypes.ARRAY_OF_ADDRESSES }, { name: 'amounts', type: ABIDataTypes.ARRAY_OF_UINT8 }], outputs: [] },
    { name: 'setTokenURI', type: F, inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }, { name: 'uri', type: ABIDataTypes.STRING }], outputs: [] },
    { name: 'registerAgent', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [] },
    { name: 'registerAgentWithOwner', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }, { name: 'owner', type: ABIDataTypes.ADDRESS }], outputs: [] },
    { name: 'revokeAgent', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [] },
    { name: 'isAgent', type: F, inputs: [{ name: 'account', type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'result', type: ABIDataTypes.BOOL }] },
    { name: 'getAgentCount', type: F, inputs: [], outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }] },
    { name: 'getAgentOwner', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }] },
    { name: 'getNextTokenId', type: F, inputs: [], outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }] },
    { name: 'ownerOf', type: F, inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }] },
    { name: 'balanceOf', type: F, inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }] },
    { name: 'tokenOfOwnerByIndex', type: F, inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }, { name: 'index', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }] },
    { name: 'tokenURI', type: F, inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'uri', type: ABIDataTypes.STRING }] },
];

const HUB_ABI: BitcoinInterfaceAbi = [
    {
        name: 'createCollection',
        type: F,
        inputs: [
            { name: 'name', type: ABIDataTypes.STRING },
            { name: 'symbol', type: ABIDataTypes.STRING },
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'baseURI', type: ABIDataTypes.STRING },
            { name: 'collectionBanner', type: ABIDataTypes.STRING },
            { name: 'collectionIcon', type: ABIDataTypes.STRING },
            { name: 'collectionWebsite', type: ABIDataTypes.STRING },
            { name: 'collectionDescription', type: ABIDataTypes.STRING },
        ],
        outputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'mint',
        type: F,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'tokenURI', type: ABIDataTypes.STRING },
        ],
        outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'batchMint',
        type: F,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'addresses', type: ABIDataTypes.ARRAY_OF_ADDRESSES },
            { name: 'amounts', type: ABIDataTypes.ARRAY_OF_UINT8 },
        ],
        outputs: [{ name: 'firstTokenId', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'setMintEnabled',
        type: F,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'enabled', type: ABIDataTypes.BOOL },
        ],
        outputs: [],
    },
    {
        name: 'ownerOf',
        type: F,
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    },
    {
        name: 'tokenURI',
        type: F,
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'uri', type: ABIDataTypes.STRING }],
    },
    {
        name: 'tokenCollection',
        type: F,
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'balanceOf',
        type: F,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'owner', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'transferFrom',
        type: F,
        inputs: [
            { name: 'tokenId', type: ABIDataTypes.UINT256 },
            { name: 'to', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [],
    },
    {
        name: 'getCollectionInfo',
        type: F,
        inputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'totalSupply', type: ABIDataTypes.UINT256 },
            { name: 'mintEnabled', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'getCollectionCount',
        type: F,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    },
    { name: 'registerAgent', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [] },
    {
        name: 'registerAgentWithOwner',
        type: F,
        inputs: [
            { name: 'agent', type: ABIDataTypes.ADDRESS },
            { name: 'owner', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [],
    },
    { name: 'revokeAgent', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [] },
    {
        name: 'isAgent',
        type: F,
        inputs: [{ name: 'account', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'result', type: ABIDataTypes.BOOL }],
    },
    { name: 'getAgentCount', type: F, inputs: [], outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }] },
    {
        name: 'getAgentOwner',
        type: F,
        inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    },
];

const MARKETPLACE_ABI: BitcoinInterfaceAbi = [
    { name: 'listNFT', type: F, inputs: [{ name: 'nftContract', type: ABIDataTypes.ADDRESS }, { name: 'tokenId', type: ABIDataTypes.UINT256 }, { name: 'price', type: ABIDataTypes.UINT256 }, { name: 'auctionDuration', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }] },
    { name: 'buyNow', type: F, inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }], outputs: [] },
    { name: 'placeBid', type: F, inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }, { name: 'bidAmount', type: ABIDataTypes.UINT256 }], outputs: [] },
    { name: 'settleListing', type: F, inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }], outputs: [] },
    { name: 'cancelListing', type: F, inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }], outputs: [] },
    { name: 'getListing', type: F, inputs: [{ name: 'listingId', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'seller', type: ABIDataTypes.ADDRESS }, { name: 'price', type: ABIDataTypes.UINT256 }, { name: 'status', type: ABIDataTypes.UINT256 }, { name: 'tokenId', type: ABIDataTypes.UINT256 }, { name: 'nftContract', type: ABIDataTypes.ADDRESS }, { name: 'expiration', type: ABIDataTypes.UINT256 }, { name: 'bidCount', type: ABIDataTypes.UINT256 }, { name: 'highestBid', type: ABIDataTypes.UINT256 }, { name: 'highestBidder', type: ABIDataTypes.ADDRESS }, { name: 'auctionDuration', type: ABIDataTypes.UINT256 }] },
    { name: 'getListingCount', type: F, inputs: [], outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }] },
    { name: 'setNftContract', type: F, inputs: [{ name: 'nftContract', type: ABIDataTypes.ADDRESS }], outputs: [] },
    { name: 'setFee', type: F, inputs: [{ name: 'basisPoints', type: ABIDataTypes.UINT256 }], outputs: [] },
    { name: 'getFee', type: F, inputs: [], outputs: [{ name: 'feeBps', type: ABIDataTypes.UINT256 }] },
];

// Cache contracts by contract address key
const contractCache = new Map<string, Promise<unknown>>();

export async function getNftContract(
    _senderAddress: string,
    nftContractAddress: string,
): Promise<IOP721Contract> {
    const normalizedContractAddress = nftContractAddress.trim().toLowerCase();
    const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
    if (normalizedHubAddress && normalizedContractAddress === normalizedHubAddress) {
        const hubContract = await getHubContract(_senderAddress);
        return hubContract as IOP721Contract;
    }

    const key = `nft:${normalizedContractAddress}`;
    const cached = contractCache.get(key);
    if (cached) return cached as Promise<IOP721Contract>;

    const pending = (async (): Promise<IOP721Contract> => {
        const collection = await getCollectionByContract(normalizedContractAddress);
        const contractAddress = await resolveAddressWithPublicKey(
            normalizedContractAddress,
            true,
            collection?.contractPublicKey,
        );
        return getContract<IOP721Contract>(
            contractAddress,
            NFT_ABI,
            getProvider(),
            getNetwork(env.network),
        );
    })();

    contractCache.set(key, pending);
    return pending;
}

export async function getMarketplaceContract(_senderAddress: string): Promise<unknown> {
    const key = 'marketplace';
    const cached = contractCache.get(key);
    if (cached) return cached;

    const pending = (async (): Promise<unknown> => {
        const marketplaceAddress = await resolveAddressWithPublicKey(CONTRACT_ADDRESSES.marketplace, true);
        return getContract(
            marketplaceAddress,
            MARKETPLACE_ABI,
            getProvider(),
            getNetwork(env.network),
        );
    })();

    contractCache.set(key, pending);
    return pending;
}

export async function getHubContract(_senderAddress: string): Promise<unknown> {
    const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
    if (!normalizedHubAddress) {
        throw new Error('NFT_HUB_CONTRACT_ADDRESS is not configured');
    }

    const key = `hub:${normalizedHubAddress}`;
    const cached = contractCache.get(key);
    if (cached) return cached;

    const pending = (async (): Promise<unknown> => {
        const hubAddress = await resolveAddressWithPublicKey(normalizedHubAddress, true);
        return getContract(
            hubAddress,
            HUB_ABI,
            getProvider(),
            getNetwork(env.network),
        );
    })();

    contractCache.set(key, pending);
    return pending;
}

export function clearContractCache(): void {
    contractCache.clear();
}
