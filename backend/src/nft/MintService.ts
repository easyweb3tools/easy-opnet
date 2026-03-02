import { getNftContract } from '../providers/ContractCache.js';
import { getHubContract } from '../providers/ContractCache.js';
import { resolveAddressWithPublicKey, setContractSender } from '../providers/AddressResolver.js';
import { getWalletAddress } from '../agents/AgentWallet.js';
import { executeTx } from '../market/TxExecutor.js';
import { uploadMetadata, type NFTMetadata } from './MetadataService.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';

interface MintResult {
    txHash: string;
    tokenId?: string;
    tokenUri: string;
}

const SET_URI_RETRY_ATTEMPTS = 6;
const SET_URI_RETRY_DELAY_MS = 2000;
const TOKEN_DISCOVERY_RETRY_ATTEMPTS = 6;
const TOKEN_DISCOVERY_RETRY_DELAY_MS = 2000;

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Mints an NFT: upload metadata to IPFS → call contract mint().
 */
export async function mintNFT(
    nftContractAddress: string,
    to: string,
    metadata: NFTMetadata,
    recipientPublicKey?: string,
    collectionId?: string,
): Promise<MintResult> {
    // Upload metadata to IPFS
    const tokenUri = await uploadMetadata(metadata);

    const walletAddress = getWalletAddress();
    const normalizedNftAddress = nftContractAddress.trim().toLowerCase();
    const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
    const recipient = await resolveAddressWithPublicKey(to, false, recipientPublicKey);

    if (normalizedHubAddress && normalizedNftAddress === normalizedHubAddress) {
        if (!collectionId) {
            throw new Error('collectionId is required when minting via NFT Hub');
        }

        const contract = await getHubContract(walletAddress);
        await setContractSender(contract, walletAddress);

        const mintFn = (contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>).mint;
        if (!mintFn) {
            throw new Error('NFT Hub contract missing mint method');
        }

        const simulation = await mintFn(
            BigInt(collectionId),
            recipient,
            tokenUri,
        );
        const decoded = (simulation as { decoded?: Record<string, unknown> }).decoded;
        const tokenId = decoded?.tokenId != null ? String(decoded.tokenId) : undefined;
        const receipt = await executeTx(simulation);

        return {
            txHash: receipt.transactionId,
            tokenId,
            tokenUri,
        };
    }

    // Legacy per-agent MyNFT flow.
    const contract = await getNftContract(walletAddress, nftContractAddress);
    await setContractSender(contract, walletAddress);

    const airdropFn = (contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>).airdrop;
    const balanceOfFn = (contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>).balanceOf;
    const tokenOfOwnerByIndexFn = (contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>).tokenOfOwnerByIndex;
    const setTokenUriFn = (contract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>).setTokenURI;

    if (!airdropFn || !balanceOfFn || !tokenOfOwnerByIndexFn || !setTokenUriFn) {
        throw new Error('Contract missing airdrop/balanceOf/tokenOfOwnerByIndex/setTokenURI methods');
    }

    const balanceBeforeSimulation = await balanceOfFn(recipient);
    const balanceBeforeDecoded = (balanceBeforeSimulation as { decoded?: Record<string, unknown> }).decoded;
    const balanceBefore = BigInt(String(balanceBeforeDecoded?.balance ?? '0'));

    // Mint 1 token to recipient using deployer-only airdrop flow.
    const airdropSimulation = await airdropFn([recipient], [1]);
    const mintReceipt = await executeTx(airdropSimulation);

    let tokenId: string | undefined;
    for (let i = 0; i < TOKEN_DISCOVERY_RETRY_ATTEMPTS; i += 1) {
        try {
            const balanceAfterSimulation = await balanceOfFn(recipient);
            const balanceAfterDecoded = (balanceAfterSimulation as { decoded?: Record<string, unknown> }).decoded;
            const balanceAfter = BigInt(String(balanceAfterDecoded?.balance ?? '0'));
            if (balanceAfter > balanceBefore) {
                const index = balanceAfter - 1n;
                const tokenOfOwnerSimulation = await tokenOfOwnerByIndexFn(recipient, index);
                const tokenDecoded = (tokenOfOwnerSimulation as { decoded?: Record<string, unknown> }).decoded;
                tokenId = String(tokenDecoded?.tokenId ?? '');
                if (tokenId) break;
            }
        } catch {
            // Continue retrying while tx/indexing catches up.
        }

        if (i < TOKEN_DISCOVERY_RETRY_ATTEMPTS - 1) {
            await wait(TOKEN_DISCOVERY_RETRY_DELAY_MS);
        }
    }

    // Attach per-token metadata URI.
    // This may lag behind mint indexing; retry briefly and keep mint success even if URI is delayed.
    let finalTxHash = mintReceipt.transactionId;
    if (tokenId) {
        let setUriLastError: string | null = null;
        for (let i = 0; i < SET_URI_RETRY_ATTEMPTS; i += 1) {
            try {
                const setUriSimulation = await setTokenUriFn(BigInt(tokenId), tokenUri);
                const setUriReceipt = await executeTx(setUriSimulation);
                finalTxHash = setUriReceipt.transactionId;
                setUriLastError = null;
                break;
            } catch (error) {
                setUriLastError = error instanceof Error ? error.message : String(error);
                if (i < SET_URI_RETRY_ATTEMPTS - 1) {
                    await wait(SET_URI_RETRY_DELAY_MS);
                }
            }
        }
        if (setUriLastError) {
            console.warn(`Mint metadata URI update delayed for token ${tokenId}: ${setUriLastError}`);
        }
    } else {
        console.warn(
            `Mint tx ${mintReceipt.transactionId} submitted but tokenId is not indexed yet. `
            + 'Returning pending token state.',
        );
    }

    return {
        txHash: finalTxHash,
        tokenId,
        tokenUri,
    };
}
