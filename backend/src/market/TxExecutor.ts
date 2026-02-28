import { getAgentWallet } from '../agents/AgentWallet.js';
import { getNetwork } from '../config/network.js';
import { env } from '../config/env.js';

interface TxOptions {
    maximumAllowedSatToSpend?: bigint;
    extraOutputs?: Array<{ address: string; value: number }>;
}

interface TxResult {
    readonly transactionId: string;
}

/**
 * Executes a contract transaction: simulate → sendTransaction.
 *
 * Backend MUST specify both signer (keypair) and mldsaSigner (mldsaKeypair).
 * Frontend MUST use signer: null, mldsaSigner: null (wallet handles signing).
 */
export async function executeTx(
    simulation: Record<string, unknown>,
    options: TxOptions = {},
): Promise<TxResult> {
    if ('error' in simulation) {
        throw new Error(`Simulation failed: ${simulation.error as string}`);
    }

    const wallet = getAgentWallet();
    const network = getNetwork(env.network);

    const sendFn = (simulation as Record<string, CallableFunction>).sendTransaction;
    if (typeof sendFn !== 'function') {
        throw new Error('Simulation result does not have sendTransaction method');
    }

    const receipt = await sendFn({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: options.maximumAllowedSatToSpend ?? 50000n,
        network,
        ...(options.extraOutputs ? { extraOutputs: options.extraOutputs } : {}),
    }) as TxResult;

    return receipt;
}
