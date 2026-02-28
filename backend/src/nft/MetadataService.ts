import { env } from '../config/env.js';

export interface NFTMetadata {
    readonly name: string;
    readonly description: string;
    readonly imageUrl: string;
    readonly attributes: ReadonlyArray<{ readonly traitType: string; readonly value: string }>;
}

interface PinataResponse {
    readonly IpfsHash: string;
}

/**
 * Uploads NFT metadata JSON to IPFS via Pinata.
 * Returns ipfs://{hash} URI.
 */
export async function uploadMetadata(metadata: NFTMetadata): Promise<string> {
    const pinataJwt = env.pinataJwt;

    if (!pinataJwt) {
        // Development fallback: return mock IPFS URI
        const mockHash = `Qm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        console.warn('Pinata JWT not configured, using mock IPFS hash:', mockHash);
        return `ipfs://${mockHash}`;
    }

    const pinataBody = {
        pinataContent: {
            name: metadata.name,
            description: metadata.description,
            image: metadata.imageUrl,
            attributes: metadata.attributes.map((attr) => ({
                trait_type: attr.traitType,
                value: attr.value,
            })),
        },
        pinataMetadata: {
            name: `${metadata.name}.json`,
        },
    };

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pinataJwt}`,
        },
        body: JSON.stringify(pinataBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata upload failed (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as PinataResponse;
    return `ipfs://${result.IpfsHash}`;
}
