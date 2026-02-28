import {
    MessageSigner,
    QuantumBIP32Factory,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { getNetwork } from '../config/network.js';
import { env } from '../config/env.js';

interface VerificationResult {
    readonly valid: boolean;
    readonly normalizedPublicKey?: string;
    readonly error?: string;
}

function isHex(value: string): boolean {
    return /^[0-9a-f]+$/i.test(value);
}

/**
 * Detects the ML-DSA security level from the hex-encoded public key length.
 */
function detectSecurityLevel(hexLength: number): MLDSASecurityLevel | null {
    switch (hexLength) {
        case 2624: return MLDSASecurityLevel.LEVEL2;  // 1312 bytes
        case 3904: return MLDSASecurityLevel.LEVEL3;  // 1952 bytes
        case 5184: return MLDSASecurityLevel.LEVEL5;  // 2592 bytes
        default: return null;
    }
}

/**
 * Verifies an ML-DSA signature from an agent.
 *
 * Flow:
 * 1. Validate public key format and detect security level
 * 2. Reconstruct a public-key-only QuantumBIP32 keypair
 * 3. Verify the ML-DSA signature via MessageSigner.verifyMLDSASignature()
 * 4. Return normalized ML-DSA public key for downstream identity handling
 */
export async function verifyAgentSignature(
    body: string,
    signature: string,
    publicKey: string,
): Promise<VerificationResult> {
    const cleanKey = (publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey).toLowerCase();
    if (cleanKey.length === 0 || cleanKey.length % 2 !== 0 || !isHex(cleanKey)) {
        return {
            valid: false,
            error: 'Invalid ML-DSA public key hex encoding',
        };
    }

    // Detect security level from public key length
    const securityLevel = detectSecurityLevel(cleanKey.length);
    if (!securityLevel) {
        return {
            valid: false,
            error: `Invalid ML-DSA public key length: ${cleanKey.length} hex chars. Expected 2624 (LEVEL2), 3904 (LEVEL3), or 5184 (LEVEL5).`,
        };
    }

    try {
        // Decode public key and signature from hex
        const pubKeyBytes = Buffer.from(cleanKey, 'hex');
        const cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature;
        if (cleanSig.length === 0 || cleanSig.length % 2 !== 0 || !isHex(cleanSig)) {
            return {
                valid: false,
                error: 'Invalid signature hex encoding',
            };
        }
        const sigBytes = Buffer.from(cleanSig, 'hex');

        // Reconstruct a public-key-only keypair for verification.
        // Chain code is not needed for signature verification (only for HD derivation),
        // so we use a zeroed 32-byte chain code.
        const dummyChainCode = new Uint8Array(32);
        const network = getNetwork(env.network);

        const remoteKeypair = QuantumBIP32Factory.fromPublicKey(
            new Uint8Array(pubKeyBytes),
            dummyChainCode,
            network,
            securityLevel,
        );

        // Verify the ML-DSA signature against the request body
        const isValid = MessageSigner.verifyMLDSASignature(
            remoteKeypair,
            body,
            new Uint8Array(sigBytes),
        );

        if (!isValid) {
            return {
                valid: false,
                error: 'ML-DSA signature verification failed',
            };
        }

        return {
            valid: true,
            normalizedPublicKey: cleanKey,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Signature verification error';
        return {
            valid: false,
            error: msg,
        };
    }
}
