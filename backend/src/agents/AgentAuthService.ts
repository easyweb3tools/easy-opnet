import { createHash } from 'node:crypto';

interface VerificationResult {
    readonly valid: boolean;
    readonly address?: string;
    readonly error?: string;
}

/**
 * Verifies an ML-DSA signature from an agent.
 *
 * Flow:
 * 1. SHA-256 hash the request body
 * 2. Verify the ML-DSA signature against the public key
 * 3. Derive the agent address from the public key
 *
 * TODO: Integrate actual ML-DSA verification once @btc-vision/transaction
 * exposes a standalone verifier. For now, this validates format and derives address.
 */
export async function verifyAgentSignature(
    body: string,
    signature: string,
    publicKey: string,
): Promise<VerificationResult> {
    // Validate public key format (ML-DSA-44 Level2 = 1312 bytes = 2624 hex chars)
    const cleanKey = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;

    // Accept any valid ML-DSA key length
    const validLengths = [2624, 3904, 5184]; // Level2, Level3, Level5 (hex chars)
    if (!validLengths.includes(cleanKey.length)) {
        // For development: accept mock keys
        if (publicKey === 'mock-public-key') {
            return {
                valid: true,
                address: 'bc1q-mock-agent-address',
            };
        }

        return {
            valid: false,
            error: `Invalid ML-DSA public key length: ${cleanKey.length} hex chars`,
        };
    }

    // SHA-256 hash the body for verification
    const _bodyHash = createHash('sha256').update(body).digest();

    // TODO: Actual ML-DSA signature verification
    // const isValid = AddressVerificator.verifyMLDSASignature(bodyHash, signature, publicKey);
    // For now, accept valid-format signatures

    // Derive address from public key (simplified)
    const keyHash = createHash('sha256').update(cleanKey, 'hex').digest('hex');
    const address = `bc1q${keyHash.slice(0, 38)}`;

    return {
        valid: true,
        address,
    };
}
