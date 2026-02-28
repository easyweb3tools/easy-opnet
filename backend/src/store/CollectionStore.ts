import { getD1Database } from '../runtime/bindings.js';

export interface CollectionRecord {
    readonly contractAddress: string;
    readonly creatorAgentAddress: string;
    readonly ownerAddress: string;
    readonly name: string;
    readonly symbol: string;
    readonly maxSupply: string;
    readonly baseURI: string;
    readonly collectionBanner: string;
    readonly collectionIcon: string;
    readonly collectionWebsite: string;
    readonly collectionDescription: string;
    readonly fundingTxHash: string;
    readonly deploymentTxHash: string;
    readonly createdAt: string;
}

export interface AgentOwnershipRecord {
    readonly agentAddress: string;
    readonly ownerAddress: string;
    readonly ownerPublicKey?: string;
    readonly collectionContractAddress?: string;
    readonly txHash?: string;
    readonly registeredAt: string;
}

interface CollectionRow {
    contract_address: string;
    creator_agent_address: string;
    owner_address: string;
    name: string;
    symbol: string;
    max_supply: string;
    base_uri: string;
    collection_banner: string;
    collection_icon: string;
    collection_website: string;
    collection_description: string;
    funding_tx_hash: string;
    deployment_tx_hash: string;
    created_at: string;
}

interface OwnershipRow {
    agent_address: string;
    owner_address: string;
    owner_public_key: string | null;
    collection_contract_address: string | null;
    tx_hash: string | null;
    registered_at: string;
}

const collectionsByContract = new Map<string, CollectionRecord>();
const collectionsByCreatorAgent = new Map<string, CollectionRecord>();
const ownerByAgent = new Map<string, string>();
const ownerPublicKeyByAgent = new Map<string, string>();
const ownerAgents = new Map<string, Set<string>>();

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

function normalizeAddress(address: string): string {
    return address.trim().toLowerCase();
}

function mapCollectionRow(row: CollectionRow): CollectionRecord {
    return {
        contractAddress: normalizeAddress(row.contract_address),
        creatorAgentAddress: normalizeAddress(row.creator_agent_address),
        ownerAddress: normalizeAddress(row.owner_address),
        name: row.name,
        symbol: row.symbol,
        maxSupply: row.max_supply,
        baseURI: row.base_uri,
        collectionBanner: row.collection_banner,
        collectionIcon: row.collection_icon,
        collectionWebsite: row.collection_website,
        collectionDescription: row.collection_description,
        fundingTxHash: row.funding_tx_hash,
        deploymentTxHash: row.deployment_tx_hash,
        createdAt: row.created_at,
    };
}

function trackCollection(record: CollectionRecord): void {
    const contractAddress = normalizeAddress(record.contractAddress);
    const creatorAgentAddress = normalizeAddress(record.creatorAgentAddress);
    const ownerAddress = normalizeAddress(record.ownerAddress);

    const normalized: CollectionRecord = {
        ...record,
        contractAddress,
        creatorAgentAddress,
        ownerAddress,
    };

    collectionsByContract.set(contractAddress, normalized);
    collectionsByCreatorAgent.set(creatorAgentAddress, normalized);
}

function trackOwnership(record: AgentOwnershipRecord): void {
    const agent = normalizeAddress(record.agentAddress);
    const owner = normalizeAddress(record.ownerAddress);

    const previousOwner = ownerByAgent.get(agent);
    if (previousOwner && previousOwner !== owner) {
        const prevSet = ownerAgents.get(previousOwner);
        if (prevSet) {
            prevSet.delete(agent);
            if (prevSet.size === 0) ownerAgents.delete(previousOwner);
        }
    }

    ownerByAgent.set(agent, owner);
    if (record.ownerPublicKey) {
        ownerPublicKeyByAgent.set(agent, record.ownerPublicKey);
    }
    const set = ownerAgents.get(owner) ?? new Set<string>();
    set.add(agent);
    ownerAgents.set(owner, set);
}

async function ensureSchema(): Promise<void> {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        const db = getD1Database();
        if (!db) {
            schemaReady = true;
            return;
        }

        await db.exec(`
CREATE TABLE IF NOT EXISTS collections (
    contract_address TEXT PRIMARY KEY,
    creator_agent_address TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    max_supply TEXT NOT NULL,
    base_uri TEXT NOT NULL,
    collection_banner TEXT NOT NULL,
    collection_icon TEXT NOT NULL,
    collection_website TEXT NOT NULL,
    collection_description TEXT NOT NULL,
    funding_tx_hash TEXT NOT NULL,
    deployment_tx_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collections_creator_agent
    ON collections (creator_agent_address);
CREATE INDEX IF NOT EXISTS idx_collections_owner
    ON collections (owner_address);
CREATE TABLE IF NOT EXISTS agent_ownership (
    agent_address TEXT PRIMARY KEY,
    owner_address TEXT NOT NULL,
    owner_public_key TEXT,
    collection_contract_address TEXT,
    tx_hash TEXT,
    registered_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_ownership_owner
    ON agent_ownership (owner_address);
        `);

        schemaReady = true;
    })();

    try {
        await schemaPromise;
    } finally {
        schemaPromise = null;
    }
}

export async function saveCollection(record: CollectionRecord): Promise<void> {
    trackCollection(record);
    trackOwnership({
        agentAddress: record.creatorAgentAddress,
        ownerAddress: record.ownerAddress,
        collectionContractAddress: record.contractAddress,
        registeredAt: record.createdAt,
    });

    await ensureSchema();
    const db = getD1Database();
    if (!db) return;

    await db.prepare(`
INSERT INTO collections (
    contract_address,
    creator_agent_address,
    owner_address,
    name,
    symbol,
    max_supply,
    base_uri,
    collection_banner,
    collection_icon,
    collection_website,
    collection_description,
    funding_tx_hash,
    deployment_tx_hash,
    created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(contract_address) DO UPDATE SET
    creator_agent_address = excluded.creator_agent_address,
    owner_address = excluded.owner_address,
    name = excluded.name,
    symbol = excluded.symbol,
    max_supply = excluded.max_supply,
    base_uri = excluded.base_uri,
    collection_banner = excluded.collection_banner,
    collection_icon = excluded.collection_icon,
    collection_website = excluded.collection_website,
    collection_description = excluded.collection_description,
    funding_tx_hash = excluded.funding_tx_hash,
    deployment_tx_hash = excluded.deployment_tx_hash,
    created_at = excluded.created_at
    `)
        .bind(
            normalizeAddress(record.contractAddress),
            normalizeAddress(record.creatorAgentAddress),
            normalizeAddress(record.ownerAddress),
            record.name,
            record.symbol,
            record.maxSupply,
            record.baseURI,
            record.collectionBanner,
            record.collectionIcon,
            record.collectionWebsite,
            record.collectionDescription,
            record.fundingTxHash,
            record.deploymentTxHash,
            record.createdAt,
        )
        .run();
}

export async function getCollectionByCreatorAgent(
    creatorAgentAddress: string,
): Promise<CollectionRecord | null> {
    const normalized = normalizeAddress(creatorAgentAddress);
    const cached = collectionsByCreatorAgent.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT
    contract_address,
    creator_agent_address,
    owner_address,
    name,
    symbol,
    max_supply,
    base_uri,
    collection_banner,
    collection_icon,
    collection_website,
    collection_description,
    funding_tx_hash,
    deployment_tx_hash,
    created_at
FROM collections
WHERE creator_agent_address = ?
ORDER BY created_at DESC
LIMIT 1
    `)
        .bind(normalized)
        .first<CollectionRow>();

    if (!row) return null;
    const mapped = mapCollectionRow(row);
    trackCollection(mapped);
    return mapped;
}

export async function getCollectionByContract(
    contractAddress: string,
): Promise<CollectionRecord | null> {
    const normalized = normalizeAddress(contractAddress);
    const cached = collectionsByContract.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT
    contract_address,
    creator_agent_address,
    owner_address,
    name,
    symbol,
    max_supply,
    base_uri,
    collection_banner,
    collection_icon,
    collection_website,
    collection_description,
    funding_tx_hash,
    deployment_tx_hash,
    created_at
FROM collections
WHERE contract_address = ?
LIMIT 1
    `)
        .bind(normalized)
        .first<CollectionRow>();

    if (!row) return null;
    const mapped = mapCollectionRow(row);
    trackCollection(mapped);
    return mapped;
}

export async function listCollectionAddresses(): Promise<string[]> {
    await ensureSchema();

    const fromCache = new Set<string>([...collectionsByContract.keys()]);
    const db = getD1Database();
    if (!db) return [...fromCache];

    const result = await db.prepare(`
SELECT contract_address
FROM collections
ORDER BY created_at DESC
    `).all<{ contract_address: string }>();

    for (const row of result.results ?? []) {
        fromCache.add(normalizeAddress(row.contract_address));
    }

    return [...fromCache];
}

export async function saveAgentOwnership(record: AgentOwnershipRecord): Promise<void> {
    trackOwnership(record);

    await ensureSchema();
    const db = getD1Database();
    if (!db) return;

    await db.prepare(`
INSERT INTO agent_ownership (
    agent_address,
    owner_address,
    owner_public_key,
    collection_contract_address,
    tx_hash,
    registered_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_address) DO UPDATE SET
    owner_address = excluded.owner_address,
    owner_public_key = excluded.owner_public_key,
    collection_contract_address = excluded.collection_contract_address,
    tx_hash = excluded.tx_hash,
    registered_at = excluded.registered_at
    `)
        .bind(
            normalizeAddress(record.agentAddress),
            normalizeAddress(record.ownerAddress),
            record.ownerPublicKey ?? null,
            record.collectionContractAddress
                ? normalizeAddress(record.collectionContractAddress)
                : null,
            record.txHash ?? null,
            record.registeredAt,
        )
        .run();
}

export async function getAgentOwnerAddress(agentAddress: string): Promise<string | null> {
    const normalized = normalizeAddress(agentAddress);
    const cached = ownerByAgent.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT
    agent_address,
    owner_address,
    owner_public_key,
    collection_contract_address,
    tx_hash,
    registered_at
FROM agent_ownership
WHERE agent_address = ?
LIMIT 1
    `)
        .bind(normalized)
        .first<OwnershipRow>();

    if (!row) return null;

    trackOwnership({
        agentAddress: row.agent_address,
        ownerAddress: row.owner_address,
        ownerPublicKey: row.owner_public_key ?? undefined,
        collectionContractAddress: row.collection_contract_address ?? undefined,
        txHash: row.tx_hash ?? undefined,
        registeredAt: row.registered_at,
    });

    return normalizeAddress(row.owner_address);
}

export async function getAgentsByOwnerAddress(ownerAddress: string): Promise<string[]> {
    const normalized = normalizeAddress(ownerAddress);
    const cachedSet = ownerAgents.get(normalized);
    const fromCache = cachedSet ? new Set<string>([...cachedSet]) : new Set<string>();

    await ensureSchema();
    const db = getD1Database();
    if (!db) return [...fromCache];

    const result = await db.prepare(`
SELECT agent_address
FROM agent_ownership
WHERE owner_address = ?
ORDER BY registered_at DESC
    `)
        .bind(normalized)
        .all<{ agent_address: string }>();

    for (const row of result.results ?? []) {
        fromCache.add(normalizeAddress(row.agent_address));
    }

    return [...fromCache];
}
