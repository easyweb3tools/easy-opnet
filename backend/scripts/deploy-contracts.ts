/**
 * deploy-contracts.ts
 *
 * Deploys AgentVaultNFT and AgentVaultMarketplace contracts to OPNet testnet.
 *
 * Usage: tsx scripts/deploy-contracts.ts
 *
 * Requires WALLET_MNEMONIC env var with a funded testnet wallet.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { networks } from '@btc-vision/bitcoin';
import {
    Mnemonic,
    TransactionFactory,
    OPNetLimitedProvider,
} from '@btc-vision/transaction';
import { getContract, JSONRpcProvider, type BitcoinInterfaceAbi, ABIDataTypes, BitcoinAbiTypes } from 'opnet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CRITICAL: OPNet testnet = networks.opnetTestnet (Signet fork). NEVER networks.testnet.
const network = networks.opnetTestnet;
const RPC_URL = process.env.OPNET_RPC_URL_TESTNET ?? 'https://testnet.opnet.org';

const MNEMONIC = process.env.WALLET_MNEMONIC;
if (!MNEMONIC) {
    console.error('ERROR: WALLET_MNEMONIC env var is required');
    process.exit(1);
}

const NFT_WASM = path.resolve(__dirname, '../../contracts/build/AgentVaultNFT.wasm');
const MARKETPLACE_WASM = path.resolve(__dirname, '../../contracts/build/AgentVaultMarketplace.wasm');

async function main(): Promise<void> {
    // Validate WASM files exist
    if (!fs.existsSync(NFT_WASM)) {
        console.error(`NFT WASM not found at ${NFT_WASM}`);
        process.exit(1);
    }
    if (!fs.existsSync(MARKETPLACE_WASM)) {
        console.error(`Marketplace WASM not found at ${MARKETPLACE_WASM}`);
        process.exit(1);
    }

    console.log('Initializing wallet...');
    const mnemonic = new Mnemonic(MNEMONIC, '', network);
    const wallet = mnemonic.derive(0);
    console.log(`Wallet address: ${wallet.p2tr}`);

    const limitedProvider = new OPNetLimitedProvider(RPC_URL);
    const jsonRpcProvider = new JSONRpcProvider({ url: RPC_URL, network });

    // Fetch challenge from the provider
    const challenge = await jsonRpcProvider.getChallenge();

    // --- Deploy NFT Contract ---
    console.log('\n--- Deploying AgentVaultNFT ---');
    const nftBytecode = new Uint8Array(fs.readFileSync(NFT_WASM));
    console.log(`NFT bytecode size: ${nftBytecode.length} bytes`);

    const nftUtxos = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 500_000n,
    });
    console.log(`Found ${nftUtxos.length} UTXOs for NFT deployment`);

    const factory = new TransactionFactory();

    const nftResult = await factory.signDeployment({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network,
        from: wallet.p2tr,
        bytecode: nftBytecode,
        utxos: nftUtxos,
        challenge,
        feeRate: 2,
        priorityFee: 330n,
        gasSatFee: 330n,
    });

    console.log(`NFT Contract address: ${nftResult.contractAddress}`);

    // Broadcast funding TX, then deployment TX
    const nftFundBroadcast = await limitedProvider.broadcastTransaction(nftResult.transaction[0], false);
    console.log(`NFT funding TX broadcast: ${nftFundBroadcast?.success ? 'OK' : 'FAILED'}`);

    const nftDeployBroadcast = await limitedProvider.broadcastTransaction(nftResult.transaction[1], false);
    console.log(`NFT deployment TX broadcast: ${nftDeployBroadcast?.success ? 'OK' : 'FAILED'}`);

    // Wait for confirmation
    console.log('Waiting 10s for NFT contract confirmation...');
    await sleep(10_000);

    // --- Deploy Marketplace Contract ---
    console.log('\n--- Deploying AgentVaultMarketplace ---');
    const marketBytecode = new Uint8Array(fs.readFileSync(MARKETPLACE_WASM));
    console.log(`Marketplace bytecode size: ${marketBytecode.length} bytes`);

    // Refresh challenge
    const challenge2 = await jsonRpcProvider.getChallenge();

    const marketUtxos = await limitedProvider.fetchUTXO({
        address: wallet.p2tr,
        minAmount: 10_000n,
        requestedAmount: 500_000n,
    });
    console.log(`Found ${marketUtxos.length} UTXOs for Marketplace deployment`);

    const marketResult = await factory.signDeployment({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        network,
        from: wallet.p2tr,
        bytecode: marketBytecode,
        utxos: marketUtxos,
        challenge: challenge2,
        feeRate: 2,
        priorityFee: 330n,
        gasSatFee: 330n,
    });

    console.log(`Marketplace Contract address: ${marketResult.contractAddress}`);

    const mktFundBroadcast = await limitedProvider.broadcastTransaction(marketResult.transaction[0], false);
    console.log(`Marketplace funding TX broadcast: ${mktFundBroadcast?.success ? 'OK' : 'FAILED'}`);

    const mktDeployBroadcast = await limitedProvider.broadcastTransaction(marketResult.transaction[1], false);
    console.log(`Marketplace deployment TX broadcast: ${mktDeployBroadcast?.success ? 'OK' : 'FAILED'}`);

    console.log('Waiting 10s for Marketplace contract confirmation...');
    await sleep(10_000);

    // --- Post-deployment setup ---
    console.log('\n--- Post-deployment setup ---');
    const nftAddress = nftResult.contractAddress;
    const marketAddress = marketResult.contractAddress;

    const F = BitcoinAbiTypes.Function;
    const MARKETPLACE_ABI: BitcoinInterfaceAbi = [
        { name: 'setNftContract', type: F, inputs: [{ name: 'nftContract', type: ABIDataTypes.ADDRESS }], outputs: [] },
    ];

    const NFT_ABI: BitcoinInterfaceAbi = [
        { name: 'registerAgent', type: F, inputs: [{ name: 'agent', type: ABIDataTypes.ADDRESS }], outputs: [] },
    ];

    // Call marketplace.setNftContract(nftAddress)
    console.log('Setting NFT contract on marketplace...');
    const marketContract = getContract(
        marketAddress,
        MARKETPLACE_ABI,
        jsonRpcProvider,
        network,
        wallet.p2tr as unknown as Parameters<typeof getContract>[4],
    );

    const setNftFn = (marketContract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>).setNftContract;
    if (setNftFn) {
        const sim = await setNftFn(nftAddress);
        const sendFn = (sim as Record<string, CallableFunction>).sendTransaction;
        if (typeof sendFn === 'function') {
            const receipt = await sendFn({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                refundTo: wallet.p2tr,
                maximumAllowedSatToSpend: 50000n,
                network,
            });
            console.log(`setNftContract TX: ${(receipt as { transactionId: string }).transactionId}`);
        }
    }

    // Call nft.registerAgent(walletAddress)
    console.log('Registering wallet as agent...');
    const nftContract = getContract(
        nftAddress,
        NFT_ABI,
        jsonRpcProvider,
        network,
        wallet.p2tr as unknown as Parameters<typeof getContract>[4],
    );

    const registerFn = (nftContract as unknown as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>).registerAgent;
    if (registerFn) {
        const sim = await registerFn(wallet.p2tr);
        const sendFn = (sim as Record<string, CallableFunction>).sendTransaction;
        if (typeof sendFn === 'function') {
            const receipt = await sendFn({
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                refundTo: wallet.p2tr,
                maximumAllowedSatToSpend: 50000n,
                network,
            });
            console.log(`registerAgent TX: ${(receipt as { transactionId: string }).transactionId}`);
        }
    }

    // Clean up
    mnemonic.zeroize();
    wallet.zeroize();
    await jsonRpcProvider.close();

    console.log('\n========================================');
    console.log('  Deployment Complete!');
    console.log('========================================');
    console.log(`  NFT_CONTRACT_ADDRESS=${nftAddress}`);
    console.log(`  MARKETPLACE_CONTRACT_ADDRESS=${marketAddress}`);
    console.log('\nAdd these to your backend/.env file.');
    console.log('========================================');
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
    console.error('Deployment failed:', err);
    process.exit(1);
});
