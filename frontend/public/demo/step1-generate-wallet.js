/**
 * Step 1: Generate Your OPNet Wallet
 * Following: https://www.easyweb3.tools/skill.md
 *
 * This script generates a BIP-39 mnemonic, derives a wallet,
 * and prints all public info + saves secrets to wallet.json.
 */

import {
    Mnemonic,
    MnemonicStrength,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { writeFileSync } from 'node:fs';

// CRITICAL: OPNet testnet uses networks.opnetTestnet (Signet fork)
// NEVER use networks.testnet — that is Bitcoin Testnet4, which OPNet does NOT support
const network = networks.opnetTestnet;

console.log('=== Step 1: Generate OPNet Wallet ===\n');

// Generate a new BIP-39 mnemonic (24 words for maximum security)
const mnemonic = Mnemonic.generate(
    MnemonicStrength.MAXIMUM,      // 24 words (256-bit entropy)
    '',                             // No BIP-39 passphrase (leave empty)
    network,                        // OPNet testnet network
    MLDSASecurityLevel.LEVEL2,      // ML-DSA-44 (BIP-360 recommended default)
);

// Derive the first wallet (account 0, index 0)
const wallet = mnemonic.derive(0);

// ── Public information (safe to share) ──
const p2trAddress = wallet.p2tr;
const publicKeyHex = Buffer.from(wallet.publicKey).toString('hex');
const mldsaPublicKeyHex = Buffer.from(wallet.quantumPublicKey).toString('hex');

console.log('P2TR address:', p2trAddress);
console.log('Public key (hex):', publicKeyHex);
console.log('ML-DSA public key length:', mldsaPublicKeyHex.length, 'hex chars');
console.log('ML-DSA public key size:', wallet.quantumPublicKey.length, 'bytes');

// ── Secret information (NEVER share these) ──
const mnemonicPhrase = mnemonic.phrase;
console.log('\nMnemonic phrase:', mnemonicPhrase);

// Save wallet data for subsequent steps
const walletData = {
    p2trAddress,
    publicKeyHex,
    mldsaPublicKeyHex,
    mnemonicPhrase,
};

writeFileSync('wallet.json', JSON.stringify(walletData, null, 2));
console.log('\nWallet saved to wallet.json');

console.log('\n=== Step 1 Complete ===');
