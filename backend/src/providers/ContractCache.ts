import { getContract, type IOP721Contract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';
import { getProvider } from './ProviderManager.js';
import { getNetwork } from '../config/network.js';
import { env } from '../config/env.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';

const F = BitcoinAbiTypes.Function;

const NFT_ABI: BitcoinInterfaceAbi = [
    { name: 'mint', type: F, inputs: [{ name: 'to', type: ABIDataTypes.ADDRESS }, { name: 'tokenURI', type: ABIDataTypes.STRING }], outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }] },
    { name: 'registerAgent', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [] },
    { name: 'revokeAgent', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [] },
    { name: 'isAgent', type: F, inputs: [{ name: 'account', type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'result', type: ABIDataTypes.BOOL }] },
    { name: 'getAgentCount', type: F, inputs: [], outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }] },
    { name: 'getNextTokenId', type: F, inputs: [], outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }] },
    { name: 'ownerOf', type: F, inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }] },
    { name: 'balanceOf', type: F, inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }], outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }] },
    { name: 'tokenURI', type: F, inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }], outputs: [{ name: 'uri', type: ABIDataTypes.STRING }] },
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

// Cache contracts by address:sender key
const contractCache = new Map<string, unknown>();

export function getNftContract(senderAddress: string): IOP721Contract {
    const key = `nft:${senderAddress}`;
    const cached = contractCache.get(key);
    if (cached) return cached as IOP721Contract;

    const contract = getContract<IOP721Contract>(
        CONTRACT_ADDRESSES.nft,
        NFT_ABI,
        getProvider(),
        getNetwork(env.network),
        senderAddress as unknown as Parameters<typeof getContract>[4],
    );

    contractCache.set(key, contract);
    return contract;
}

export function getMarketplaceContract(senderAddress: string): unknown {
    const key = `marketplace:${senderAddress}`;
    const cached = contractCache.get(key);
    if (cached) return cached;

    const contract = getContract(
        CONTRACT_ADDRESSES.marketplace,
        MARKETPLACE_ABI,
        getProvider(),
        getNetwork(env.network),
        senderAddress as unknown as Parameters<typeof getContract>[4],
    );

    contractCache.set(key, contract);
    return contract;
}

export function clearContractCache(): void {
    contractCache.clear();
}
