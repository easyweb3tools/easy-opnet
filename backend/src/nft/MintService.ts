import { getNftContract } from '../providers/ContractCache.js';
import { getWalletAddress } from '../agents/AgentWallet.js';
import { executeTx } from '../market/TxExecutor.js';
import { uploadMetadata, type NFTMetadata } from './MetadataService.js';

interface MintResult {
    txHash: string;
    tokenId: string;
    tokenUri: string;
}

/**
 * Mints an NFT: upload metadata to IPFS → call contract mint().
 */
export async function mintNFT(
    to: string,
    metadata: NFTMetadata,
): Promise<MintResult> {
    // Upload metadata to IPFS
    const tokenUri = await uploadMetadata(metadata);

    // Get contract and simulate
    const contract = getNftContract(getWalletAddress());
    const mintFn = (contract as unknown as Record<string, (to: string, uri: string) => Promise<Record<string, unknown>>>).mint;
    if (!mintFn) {
        throw new Error('mint method not found on contract');
    }

    const simulation = await mintFn(to, tokenUri);

    // Execute transaction
    const receipt = await executeTx(simulation);

    return {
        txHash: receipt.transactionId,
        tokenId: '0', // TODO: Parse from receipt events
        tokenUri,
    };
}
