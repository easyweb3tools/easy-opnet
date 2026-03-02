import {
    BinaryWriter,
    OPNetLimitedProvider,
    TransactionFactory,
} from '@btc-vision/transaction';
import { getAgentWallet } from '../agents/AgentWallet.js';
import { resolveWalletMldsaLinkState } from '../agents/MldsaLinkState.js';
import { env } from '../config/env.js';
import { getNetwork } from '../config/network.js';
import { getProvider, getRpcUrl } from '../providers/ProviderManager.js';
import { saveCollection } from '../store/CollectionStore.js';
import { getMyNftBytecode } from './generated/MyNFTWasm.js';
import type {
    DeployCollectionRequest,
    DeployCollectionResponse,
} from '../types/index.js';

const MIN_UTXO_AMOUNT = 10_000n;
const MIN_REQUESTED_AMOUNT = 50_000n;
const DEFAULT_REQUESTED_AMOUNT = 500_000n;
const DEPLOY_TX_POLL_ATTEMPTS = 10;
const DEPLOY_TX_POLL_INTERVAL_MS = 1000;
const CONTRACT_INDEX_POLL_ATTEMPTS = 10;
const CONTRACT_INDEX_POLL_INTERVAL_MS = 1000;
const DEPLOY_PRIORITY_FEE = 10_000n;
const DEPLOY_GAS_SAT_FEE = 10_000n;

function normalizePublicKey(value: string): string {
    return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

function parseMaxSupply(value: string): bigint {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error('maxSupply is required');
    }

    let parsed: bigint;
    try {
        parsed = BigInt(normalized);
    } catch {
        throw new Error('maxSupply must be a valid integer string');
    }

    if (parsed <= 0n) {
        throw new Error('maxSupply must be greater than zero');
    }

    return parsed;
}

function resolveRequestedAmount(availableBalance: bigint): bigint {
    if (availableBalance <= 0n) {
        return MIN_REQUESTED_AMOUNT;
    }

    if (availableBalance < MIN_REQUESTED_AMOUNT) {
        return MIN_UTXO_AMOUNT;
    }

    if (availableBalance < DEFAULT_REQUESTED_AMOUNT) {
        return availableBalance;
    }

    return DEFAULT_REQUESTED_AMOUNT;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function waitForSuccessfulDeploymentTx(
    provider: ReturnType<typeof getProvider>,
    deploymentTxHash: string,
): Promise<void> {
    let lastError: string | null = null;

    for (let i = 0; i < DEPLOY_TX_POLL_ATTEMPTS; i += 1) {
        try {
            const tx = await provider.getTransaction(deploymentTxHash) as unknown as {
                failed?: boolean;
                revert?: string;
            };
            const failed = tx.failed;
            if (failed === true) {
                const revert = typeof tx.revert === 'string' ? tx.revert : '';
                throw new Error(
                    `Deployment transaction reverted: ${revert || 'unknown revert reason'}`,
                );
            }
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            // Transaction is available and explicitly reverted: fail fast with cause.
            if (message.startsWith('Deployment transaction reverted:')) {
                throw new Error(message);
            }

            // Transaction may still be in mempool and not indexed by getTransaction yet.
            try {
                const pending = await provider.getPendingTransaction(deploymentTxHash);
                if (pending) {
                    lastError = `Transaction ${deploymentTxHash} is still pending in mempool`;
                } else {
                    lastError = message;
                }
            } catch {
                lastError = message;
            }
        }

        if (i < DEPLOY_TX_POLL_ATTEMPTS - 1) {
            await wait(DEPLOY_TX_POLL_INTERVAL_MS);
        }
    }

    throw new Error(
        `Unable to confirm deployment transaction status for ${deploymentTxHash}. `
        + `Last error: ${lastError ?? 'unknown error'}`,
    );
}

async function waitForContractCodeIndexed(
    provider: ReturnType<typeof getProvider>,
    contractAddress: string,
): Promise<void> {
    let lastError: string | null = null;

    for (let i = 0; i < CONTRACT_INDEX_POLL_ATTEMPTS; i += 1) {
        try {
            await provider.getCode(contractAddress, false);
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            lastError = message;

            // Keep polling on "not yet indexed" style messages.
            if (
                message.includes('Contract bytecode not found')
                || message.includes('No public key information found')
            ) {
                // continue polling
            } else {
                throw error;
            }
        }

        if (i < CONTRACT_INDEX_POLL_ATTEMPTS - 1) {
            await wait(CONTRACT_INDEX_POLL_INTERVAL_MS);
        }
    }

    throw new Error(
        `Contract ${contractAddress} is not indexed yet after deployment. `
        + `Last error: ${lastError ?? 'unknown error'}`,
    );
}

export async function deployCollection(
    params: DeployCollectionRequest,
): Promise<DeployCollectionResponse> {
    const maxSupply = parseMaxSupply(params.maxSupply);

    const writer = new BinaryWriter();
    writer.writeStringWithLength(params.name);
    writer.writeStringWithLength(params.symbol);
    writer.writeU256(maxSupply);
    writer.writeStringWithLength(params.baseURI ?? '');
    writer.writeStringWithLength(params.collectionBanner ?? '');
    writer.writeStringWithLength(params.collectionIcon ?? '');
    writer.writeStringWithLength(params.collectionWebsite ?? '');
    writer.writeStringWithLength(params.collectionDescription ?? '');

    const calldata = new Uint8Array(writer.getBuffer());
    const bytecode = getMyNftBytecode();

    const wallet = getAgentWallet();
    const network = getNetwork(env.network);
    const provider = getProvider();
    const rpcUrl = getRpcUrl();
    const limitedProvider = new OPNetLimitedProvider(rpcUrl);
    const challenge = await provider.getChallenge();
    const linkState = await resolveWalletMldsaLinkState(provider);

    let availableBalance = 0n;
    try {
        const rawBalance = await provider.getBalance(wallet.p2tr, true);
        availableBalance = typeof rawBalance === 'bigint' ? rawBalance : BigInt(rawBalance);
    } catch {
        // Fallback to default request amount if balance query fails.
        availableBalance = 0n;
    }

    const requestedAmount = resolveRequestedAmount(availableBalance);

    let utxos: Awaited<ReturnType<OPNetLimitedProvider['fetchUTXO']>>;
    try {
        utxos = await limitedProvider.fetchUTXO({
            address: wallet.p2tr,
            minAmount: MIN_UTXO_AMOUNT,
            requestedAmount,
        });
    } catch {
        throw new Error(
            `No UTXO found for deployment wallet ${wallet.p2tr}. `
            + `Available balance: ${availableBalance.toString()} sats, `
            + `requested: ${requestedAmount.toString()} sats.`,
        );
    }

    if (utxos.length === 0) {
        throw new Error(
            `No UTXOs available for deployment wallet ${wallet.p2tr}. `
            + `Available balance: ${availableBalance.toString()} sats, `
            + `requested: ${requestedAmount.toString()} sats.`,
        );
    }

    const factory = new TransactionFactory();
    type SignDeploymentArgs = Parameters<TransactionFactory['signDeployment']>[0];

    const result = await factory.signDeployment({
        signer: wallet.keypair as SignDeploymentArgs['signer'],
        mldsaSigner: wallet.mldsaKeypair as SignDeploymentArgs['mldsaSigner'],
        network,
        from: wallet.p2tr,
        bytecode,
        calldata,
        utxos,
        challenge,
        feeRate: 2,
        priorityFee: DEPLOY_PRIORITY_FEE,
        gasSatFee: DEPLOY_GAS_SAT_FEE,
        linkMLDSAPublicKeyToAddress: linkState.linkRequired,
    });

    if (!result.transaction || result.transaction.length < 2) {
        throw new Error('Deployment signing returned incomplete transactions');
    }

    const fundingResult = await limitedProvider.broadcastTransaction(
        result.transaction[0],
        false,
    );
    if (!fundingResult?.success) {
        throw new Error('Funding transaction broadcast failed');
    }

    const deploymentResult = await limitedProvider.broadcastTransaction(
        result.transaction[1],
        false,
    );
    if (!deploymentResult?.success) {
        throw new Error('Deployment transaction broadcast failed');
    }

    const deploymentTxHash = deploymentResult.result ?? '';
    if (!deploymentTxHash) {
        throw new Error('Deployment transaction hash is missing');
    }

    try {
        await waitForSuccessfulDeploymentTx(provider, deploymentTxHash);
        await waitForContractCodeIndexed(provider, result.contractAddress);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Hard-fail only if deployment reverted. Otherwise keep record and let callers retry.
        if (message.startsWith('Deployment transaction reverted:')) {
            throw new Error(message);
        }
    }

    const createdAt = new Date().toISOString();
    const contractPublicKey = normalizePublicKey(result.contractPubKey);
    await saveCollection({
        contractAddress: result.contractAddress,
        contractPublicKey,
        creatorAgentAddress: params.address,
        creatorAgentPublicKey: params.publicKey ? normalizePublicKey(params.publicKey) : undefined,
        ownerAddress: params.address,
        ownerPublicKey: params.publicKey ? normalizePublicKey(params.publicKey) : undefined,
        name: params.name,
        symbol: params.symbol,
        maxSupply: params.maxSupply,
        baseURI: params.baseURI ?? '',
        collectionBanner: params.collectionBanner ?? '',
        collectionIcon: params.collectionIcon ?? '',
        collectionWebsite: params.collectionWebsite ?? '',
        collectionDescription: params.collectionDescription ?? '',
        fundingTxHash: fundingResult.result ?? '',
        deploymentTxHash,
        createdAt,
    });

    return {
        contractAddress: result.contractAddress,
        contractPublicKey,
        fundingTxHash: fundingResult.result ?? '',
        deploymentTxHash,
    };
}
