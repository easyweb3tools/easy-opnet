/**
 * test-hub-step2.ts
 *
 * Continue from step 2: setMintEnabled → mint (collectionId=1 already created)
 *
 * Usage: tsx scripts/test-hub-step2.ts
 */

import 'dotenv/config';
import { networks } from '@btc-vision/bitcoin';
import { Mnemonic } from '@btc-vision/transaction';
import { getContract, JSONRpcProvider, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

type DeployNetwork = 'regtest' | 'testnet' | 'mainnet';

const NETWORK_NAME = (process.env.OPNET_NETWORK ?? 'testnet') as DeployNetwork;
const NETWORK_MAP = {
    regtest: networks.regtest,
    testnet: networks.opnetTestnet,
    mainnet: networks.bitcoin,
} as const;
const RPC_URL_MAP = {
    regtest: process.env.OPNET_RPC_URL_REGTEST ?? 'https://regtest.opnet.org',
    testnet: process.env.OPNET_RPC_URL_TESTNET ?? 'https://testnet.opnet.org',
    mainnet: process.env.OPNET_RPC_URL_MAINNET ?? 'https://mainnet.opnet.org',
} as const;

const network = NETWORK_MAP[NETWORK_NAME];
const RPC_URL = RPC_URL_MAP[NETWORK_NAME];
const HUB_ADDRESS = process.env.NFT_HUB_CONTRACT_ADDRESS!;
const MNEMONIC = process.env.WALLET_MNEMONIC!;
const COLLECTION_ID = 0n; // collectionId=0 on new contract

const F = BitcoinAbiTypes.Function;
const HUB_ABI: BitcoinInterfaceAbi = [
    {
        name: 'setMintEnabled', type: F,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'enabled', type: ABIDataTypes.BOOL },
        ],
        outputs: [],
    },
    {
        name: 'mint', type: F,
        inputs: [
            { name: 'collectionId', type: ABIDataTypes.UINT256 },
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'tokenURI', type: ABIDataTypes.STRING },
        ],
        outputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'getCollectionCount', type: F,
        inputs: [],
        outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'getCollectionInfo', type: F,
        inputs: [{ name: 'collectionId', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'maxSupply', type: ABIDataTypes.UINT256 },
            { name: 'totalSupply', type: ABIDataTypes.UINT256 },
            { name: 'mintEnabled', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'ownerOf', type: F,
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    },
    {
        name: 'tokenURI', type: F,
        inputs: [{ name: 'tokenId', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'uri', type: ABIDataTypes.STRING }],
    },
];

function wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitForTx(
    provider: JSONRpcProvider,
    txId: string,
    label: string,
    maxAttempts = 60,
    intervalMs = 10_000,
): Promise<void> {
    console.log(`  Waiting for ${label} TX to be mined...`);
    for (let i = 1; i <= maxAttempts; i++) {
        await wait(intervalMs);
        try {
            const tx = await provider.getTransaction(txId);
            if (tx) {
                console.log(`  TX confirmed after ${i * intervalMs / 1000}s`);
                console.log(`  Waiting 5s for state indexing...`);
                await wait(5000);
                return;
            }
        } catch {
            // Not found yet
        }
        if (i % 6 === 0) {
            console.log(`  Still waiting... (${i * intervalMs / 1000}s)`);
        }
    }
    throw new Error(`${label} TX not confirmed after ${maxAttempts * intervalMs / 1000}s`);
}

async function main(): Promise<void> {
    console.log(`Hub: ${HUB_ADDRESS}`);
    console.log(`Collection ID: ${COLLECTION_ID}\n`);

    const mnemonic = new Mnemonic(MNEMONIC, '', network);
    const wallet = mnemonic.deriveOPWallet();
    console.log(`Wallet: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network });

    try {
        const balance = await provider.getBalance(wallet.p2tr, true);
        console.log(`Balance: ${balance} sats\n`);

        const contract = getContract(HUB_ADDRESS, HUB_ABI, provider, network);
        const hub = contract as any;

        // Set sender
        console.log('Setting contract sender...');
        const senderAddr = await provider.getPublicKeyInfo(wallet.p2tr, true);
        hub.setSender(senderAddr);
        const walletAddr = await provider.getPublicKeyInfo(wallet.p2tr, false);
        console.log('Sender set.\n');

        // Verify collection exists
        console.log('═══ Pre-check: getCollectionInfo ═══');
        const infoSim = await hub.getCollectionInfo(COLLECTION_ID);
        console.log(`  Collection info:`, JSON.stringify(infoSim.properties ?? {}, null, 4));
        const mintEnabled = infoSim.properties?.mintEnabled;
        console.log(`  Mint enabled: ${mintEnabled}\n`);

        // ── Step 2: Enable Minting (skip if already enabled) ──
        if (!mintEnabled) {
            console.log('═══ Step 2: setMintEnabled(true) ═══');
            const enableSim = await hub.setMintEnabled(COLLECTION_ID, true);
            console.log('  Simulation OK. Sending TX...');

            const sendFn = enableSim.sendTransaction;
            let linkRequired = false;
            try {
                const info = await provider.getPublicKeyInfo([wallet.p2tr]);
                const w = (info as any)?.[wallet.p2tr] ?? (info as any)?.[0];
                if (w && typeof w === 'object') linkRequired = !(w as any).mldsaLinked;
            } catch {}

            const receipt = await sendFn.call(enableSim, {
                signer: wallet.keypair,
                mldsaSigner: wallet.mldsaKeypair,
                linkMLDSAPublicKeyToAddress: linkRequired,
                refundTo: wallet.p2tr,
                maximumAllowedSatToSpend: 50000n,
                network,
            });
            const enableTx = receipt.transactionId ?? String(receipt);
            console.log(`  TX: ${enableTx}`);
            await waitForTx(provider, enableTx, 'setMintEnabled');
        } else {
            console.log('Minting already enabled, skipping Step 2.\n');
        }

        // ── Step 3: Mint NFT ──
        console.log('═══ Step 3: mint ═══');
        const mintSim = await hub.mint(
            COLLECTION_ID,
            walletAddr,
            'https://img.easyweb3.tools/easyweb3.jpg',
        );
        const tokenId = mintSim.properties?.tokenId ?? 'unknown';
        console.log(`  Token ID (simulation): ${tokenId}`);
        console.log('  Sending TX...');

        let linkRequired = false;
        try {
            const info = await provider.getPublicKeyInfo([wallet.p2tr]);
            const w = (info as any)?.[wallet.p2tr] ?? (info as any)?.[0];
            if (w && typeof w === 'object') linkRequired = !(w as any).mldsaLinked;
        } catch {}

        const mintReceipt = await mintSim.sendTransaction.call(mintSim, {
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            linkMLDSAPublicKeyToAddress: linkRequired,
            refundTo: wallet.p2tr,
            maximumAllowedSatToSpend: 50000n,
            network,
        });
        const mintTx = mintReceipt.transactionId ?? String(mintReceipt);
        console.log(`  TX: ${mintTx}`);
        await waitForTx(provider, mintTx, 'mint');

        // ── Step 4: Verify ──
        console.log('═══ Step 4: Verify ═══');
        try {
            const finalInfo = await hub.getCollectionInfo(COLLECTION_ID);
            console.log(`  Collection:`, JSON.stringify(finalInfo.properties ?? {}));
        } catch (e) { console.log(`  getCollectionInfo: ${e}`); }

        try {
            const ownerSim = await hub.ownerOf(BigInt(tokenId));
            console.log(`  Token ${tokenId} owner: ${ownerSim.properties?.owner ?? 'N/A'}`);
        } catch (e) { console.log(`  ownerOf: ${e}`); }

        try {
            const uriSim = await hub.tokenURI(BigInt(tokenId));
            console.log(`  Token ${tokenId} URI: ${uriSim.properties?.uri ?? 'N/A'}`);
        } catch (e) { console.log(`  tokenURI: ${e}`); }

        console.log('\n════════════════════════════════════');
        console.log('  SUCCESS! NFT minted via Hub');
        console.log('════════════════════════════════════');
        console.log(`  Collection ID: ${COLLECTION_ID}`);
        console.log(`  Token ID:      ${tokenId}`);
        console.log(`  Mint TX:       ${mintTx}`);
        console.log('════════════════════════════════════');

    } finally {
        if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
        if (typeof wallet.zeroize === 'function') wallet.zeroize();
        await provider.close();
    }
}

main().catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
});
