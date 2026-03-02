import { getAgentWallet } from '../agents/AgentWallet.js';
import { resolveWalletMldsaLinkState } from '../agents/MldsaLinkState.js';
import { getNetwork } from '../config/network.js';
import { env } from '../config/env.js';
import { getProvider } from '../providers/ProviderManager.js';

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
    const linkState = await resolveWalletMldsaLinkState(getProvider());

    const simulationObject = simulation as Record<string, unknown>;
    const sendFn = simulationObject.sendTransaction as ((params: Record<string, unknown>) => Promise<TxResult>) | undefined;
    if (typeof sendFn !== 'function') {
        throw new Error('Simulation result does not have sendTransaction method');
    }

    const receipt = await sendFn.call(simulationObject, {
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        linkMLDSAPublicKeyToAddress: linkState.linkRequired,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: options.maximumAllowedSatToSpend ?? 50000n,
        network,
        ...(options.extraOutputs ? { extraOutputs: options.extraOutputs } : {}),
    }) as TxResult;

    return receipt;
}
