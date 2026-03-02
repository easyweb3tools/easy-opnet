import { Mnemonic } from '@btc-vision/transaction';
import { env } from '../config/env.js';
import { getNetwork } from '../config/network.js';

interface AgentWalletInstance {
    readonly keypair: unknown;
    readonly mldsaKeypair: unknown;
    readonly address: string;
    readonly publicKey: string;
    readonly p2tr: string;
}

let walletInstance: AgentWalletInstance | null = null;

export function getAgentWallet(): AgentWalletInstance {
    if (walletInstance) {
        return walletInstance;
    }

    if (!env.walletMnemonic) {
        throw new Error('WALLET_MNEMONIC not configured. Set it in .env');
    }

    const network = getNetwork(env.network);
    const mnemonic = new Mnemonic(
        env.walletMnemonic,
        '',
        network,
    );

    const wallet = mnemonic.deriveOPWallet();

    walletInstance = {
        keypair: wallet.keypair,
        mldsaKeypair: wallet.mldsaKeypair,
        address: wallet.p2tr,
        publicKey: Buffer.from(wallet.publicKey).toString('hex'),
        p2tr: wallet.p2tr,
    };

    return walletInstance;
}

export function getWalletAddress(): string {
    return getAgentWallet().address;
}
