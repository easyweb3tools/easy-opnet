/**
 * test-hub-e2e.ts
 *
 * End-to-end test: createCollection → setMintEnabled → mint
 *
 * Usage: tsx scripts/test-hub-e2e.ts
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
const HUB_ADDRESS = process.env.NFT_HUB_CONTRACT_ADDRESS;
const MNEMONIC = process.env.WALLET_MNEMONIC;

if (!HUB_ADDRESS) { console.error('ERROR: NFT_HUB_CONTRACT_ADDRESS not set'); process.exit(1); }
if (!MNEMONIC) { console.error('ERROR: WALLET_MNEMONIC not set'); process.exit(1); }

const F = BitcoinAbiTypes.Function;
const HUB_ABI: BitcoinInterfaceAbi = [
    {
        name: 'createCollection', type: F,
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
    console.log(`  Waiting for ${label} TX to be mined (polling every ${intervalMs / 1000}s, max ${maxAttempts} attempts)...`);
    for (let i = 1; i <= maxAttempts; i++) {
        await wait(intervalMs);
        try {
            const tx = await provider.getTransaction(txId);
            if (tx) {
                console.log(`  TX confirmed in block after ${i * intervalMs / 1000}s`);
                // Extra wait for state indexing
                console.log(`  Waiting 5s for state indexing...`);
                await wait(5000);
                return;
            }
        } catch {
            // Not found yet, keep polling
        }
        if (i % 6 === 0) {
            console.log(`  Still waiting... (${i * intervalMs / 1000}s elapsed)`);
        }
    }
    throw new Error(`${label} TX ${txId} not confirmed after ${maxAttempts * intervalMs / 1000}s`);
}

async function sendTx(
    simulation: Record<string, unknown>,
    wallet: ReturnType<ReturnType<typeof Mnemonic.prototype.deriveOPWallet>>,
    provider: JSONRpcProvider,
    label: string,
): Promise<string> {
    if ('error' in simulation) {
        throw new Error(`${label} simulation failed: ${simulation.error}`);
    }

    const props = (simulation as any).properties;
    if (props) {
        console.log(`  Simulation properties:`, JSON.stringify(props));
    }

    // Check if linking is needed
    let linkRequired = false;
    try {
        const info = await provider.getPublicKeyInfo([wallet.p2tr]);
        const walletInfo = (info as any)?.[wallet.p2tr] ?? (info as any)?.[0];
        if (walletInfo && typeof walletInfo === 'object') {
            linkRequired = !(walletInfo as any).mldsaLinked;
        }
    } catch {
        // Default to false
    }

    const sendFn = (simulation as any).sendTransaction;
    if (typeof sendFn !== 'function') {
        throw new Error(`${label}: sendTransaction not found on simulation`);
    }

    const receipt = await sendFn.call(simulation, {
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        linkMLDSAPublicKeyToAddress: linkRequired,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: 50000n,
        network,
    });

    const txId = (receipt as any).transactionId ?? (receipt as any).txHash ?? String(receipt);
    console.log(`  TX sent: ${txId}`);
    return txId;
}

async function main(): Promise<void> {
    console.log(`Network: ${NETWORK_NAME}`);
    console.log(`Hub: ${HUB_ADDRESS}\n`);

    const mnemonic = new Mnemonic(MNEMONIC!, '', network);
    const wallet = mnemonic.deriveOPWallet();
    console.log(`Wallet: ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network });

    try {
        const balance = await provider.getBalance(wallet.p2tr, true);
        console.log(`Balance: ${balance} sats\n`);

        const contract = getContract(HUB_ADDRESS!, HUB_ABI, provider, network);
        const hub = contract as any;

        // Set sender so Blockchain.tx.sender matches our wallet in simulations
        console.log('Setting contract sender...');
        try {
            const senderAddr = await provider.getPublicKeyInfo(wallet.p2tr, true);
            hub.setSender(senderAddr);
            console.log('Sender set successfully.\n');
        } catch (e) {
            console.log(`setSender warning: ${e}. Continuing...\n`);
        }

        // ── Step 1: Create Collection ──
        console.log('═══ Step 1: createCollection ═══');
        const createSim = await hub.createCollection(
            'EasyWeb3 Genesis',      // name
            'EW3G',                   // symbol
            100n,                     // maxSupply
            'https://img.easyweb3.tools/easyweb3.jpg',  // baseURI
            'https://img.easyweb3.tools/easyweb3.jpg',  // banner
            'https://img.easyweb3.tools/easyweb3.jpg',  // icon
            'https://www.easyweb3.tools',                // website
            'AI-Native NFT Marketplace on Bitcoin L1',   // description
        );

        const collectionId = createSim.properties?.collectionId ?? '0';
        console.log(`  Collection ID (from simulation): ${collectionId}`);

        const createTx = await sendTx(createSim, wallet, provider, 'createCollection');
        await waitForTx(provider, createTx, 'createCollection');

        // ── Step 2: Enable Minting ──
        console.log('═══ Step 2: setMintEnabled ═══');
        const enableSim = await hub.setMintEnabled(
            BigInt(collectionId),
            true,
        );
        const enableTx = await sendTx(enableSim, wallet, provider, 'setMintEnabled');
        await waitForTx(provider, enableTx, 'setMintEnabled');

        // ── Step 3: Mint NFT ──
        console.log('═══ Step 3: mint ═══');
        const walletAddr = await provider.getPublicKeyInfo(wallet.p2tr, false);
        const mintSim = await hub.mint(
            BigInt(collectionId),
            walletAddr,
            'https://img.easyweb3.tools/easyweb3.jpg',  // tokenURI
        );
        const tokenId = mintSim.properties?.tokenId ?? 'unknown';
        console.log(`  Token ID (from simulation): ${tokenId}`);

        const mintTx = await sendTx(mintSim, wallet, provider, 'mint');
        await waitForTx(provider, mintTx, 'mint');

        // ── Step 4: Verify ──
        console.log('═══ Step 4: Verify on-chain state ═══');
        try {
            const countSim = await hub.getCollectionCount();
            console.log(`  Collection count: ${countSim.properties?.count ?? 'N/A'}`);
        } catch (e) { console.log(`  getCollectionCount failed: ${e}`); }

        try {
            const infoSim = await hub.getCollectionInfo(BigInt(collectionId));
            console.log(`  Collection info:`, JSON.stringify(infoSim.properties ?? {}, null, 4));
        } catch (e) { console.log(`  getCollectionInfo failed: ${e}`); }

        try {
            const ownerSim = await hub.ownerOf(BigInt(tokenId));
            console.log(`  Token ${tokenId} owner: ${ownerSim.properties?.owner ?? 'N/A'}`);
        } catch (e) { console.log(`  ownerOf failed (may need more time): ${e}`); }

        console.log('\n════════════════════════════════════');
        console.log('  E2E Test Complete');
        console.log('════════════════════════════════════');
        console.log(`  Collection ID: ${collectionId}`);
        console.log(`  Token ID:      ${tokenId}`);
        console.log(`  createCollection TX: ${createTx}`);
        console.log(`  setMintEnabled TX:   ${enableTx}`);
        console.log(`  mint TX:             ${mintTx}`);
        console.log('════════════════════════════════════');

    } finally {
        if (typeof mnemonic.zeroize === 'function') mnemonic.zeroize();
        if (typeof wallet.zeroize === 'function') wallet.zeroize();
        await provider.close();
    }
}

main().catch((err) => {
    console.error('E2E test failed:', err);
    process.exit(1);
});
