import { getD1Database } from '../runtime/bindings.js';
import { CONTRACT_ADDRESSES } from '../config/contracts.js';

export interface CollectionRecord {
    readonly contractAddress: string;
    readonly contractPublicKey?: string;
    readonly creatorAgentAddress: string;
    readonly creatorAgentPublicKey?: string;
    readonly ownerAddress: string;
    readonly ownerPublicKey?: string;
    readonly collectionId?: string;
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
    readonly txHash?: string;
    readonly createdAt: string;
}

export interface AgentOwnershipRecord {
    readonly agentAddress: string;
    readonly agentPublicKey?: string;
    readonly ownerAddress: string;
    readonly ownerPublicKey?: string;
    readonly collectionContractAddress?: string;
    readonly collectionId?: string;
    readonly txHash?: string;
    readonly registeredAt: string;
}

export interface ImportedCollectionRecord {
    readonly id: string;
    readonly agentAddress: string;
    readonly nftContractAddress: string;
    readonly name: string;
    readonly symbol: string;
    readonly collectionBanner: string;
    readonly collectionIcon: string;
    readonly collectionWebsite: string;
    readonly collectionDescription: string;
    readonly verified: boolean;
    readonly importedAt: string;
}

interface CollectionRow {
    contract_address: string;
    contract_public_key: string | null;
    creator_agent_address: string;
    creator_agent_public_key: string | null;
    owner_address: string;
    owner_public_key: string | null;
    collection_id: string | null;
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
    agent_public_key: string | null;
    owner_address: string;
    owner_public_key: string | null;
    collection_contract_address: string | null;
    collection_id: string | null;
    tx_hash: string | null;
    registered_at: string;
}

const collectionsByContract = new Map<string, CollectionRecord>();
const collectionsByCreatorAgent = new Map<string, CollectionRecord>();
const ownerByAgent = new Map<string, string>();
const collectionContractByAgent = new Map<string, string>();
const ownershipRecordByAgent = new Map<string, AgentOwnershipRecord>();
const collectionIdByAgent = new Map<string, string>();
const agentPublicKeyByAgent = new Map<string, string>();
const ownerPublicKeyByAgent = new Map<string, string>();
const contractPublicKeyByContract = new Map<string, string>();
const ownerAgents = new Map<string, Set<string>>();
const importedCollectionsByAgent = new Map<string, ImportedCollectionRecord[]>();
const importedCollectionsByKey = new Map<string, ImportedCollectionRecord>();
const agentsByImportedContract = new Map<string, Set<string>>();

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;
let localCollectionsLoaded = false;
let localOwnershipLoaded = false;
let localImportedLoaded = false;
let importedDbLoaded = false;

const LOCAL_COLLECTIONS_FILE = '.agentvault-collections.json';
const LOCAL_OWNERSHIP_FILE = '.agentvault-ownership.json';
const LOCAL_IMPORTED_FILE = '.agentvault-imported-collections.json';

function importedKey(agent: string, contract: string): string {
    return `${agent}:${contract}`;
}

function normalizeAddress(address: string): string {
    return address.trim().toLowerCase();
}

function normalizePublicKey(publicKey: string): string {
    const clean = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
    return clean.trim().toLowerCase();
}

function canUseLocalFilesystem(): boolean {
    return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

async function readLocalCollections(): Promise<CollectionRecord[]> {
    if (!canUseLocalFilesystem()) return [];

    try {
        const [{ readFile }, { join }] = await Promise.all([
            import('node:fs/promises'),
            import('node:path'),
        ]);
        const raw = await readFile(join(process.cwd(), LOCAL_COLLECTIONS_FILE), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((value): value is CollectionRecord => {
                return Boolean(
                    value
                    && typeof value === 'object'
                    && typeof (value as CollectionRecord).contractAddress === 'string'
                    && typeof (value as CollectionRecord).creatorAgentAddress === 'string'
                    && typeof (value as CollectionRecord).ownerAddress === 'string',
                );
            })
            .map((value) => ({
                ...value,
                contractAddress: normalizeAddress(value.contractAddress),
                contractPublicKey: value.contractPublicKey
                    ? normalizePublicKey(value.contractPublicKey)
                    : undefined,
                creatorAgentAddress: normalizeAddress(value.creatorAgentAddress),
                creatorAgentPublicKey: value.creatorAgentPublicKey
                    ? normalizePublicKey(value.creatorAgentPublicKey)
                    : undefined,
                ownerAddress: normalizeAddress(value.ownerAddress),
                ownerPublicKey: value.ownerPublicKey
                    ? normalizePublicKey(value.ownerPublicKey)
                    : undefined,
                collectionId: value.collectionId ? value.collectionId.trim() : undefined,
                txHash: value.txHash ?? undefined,
            }));
    } catch {
        return [];
    }
}

async function writeLocalCollections(records: CollectionRecord[]): Promise<void> {
    if (!canUseLocalFilesystem()) return;

    try {
        const [{ writeFile }, { join }] = await Promise.all([
            import('node:fs/promises'),
            import('node:path'),
        ]);
        await writeFile(
            join(process.cwd(), LOCAL_COLLECTIONS_FILE),
            JSON.stringify(records, null, 2),
            'utf-8',
        );
    } catch {
        // Best-effort local fallback persistence only.
    }
}

async function loadLocalCollectionsIntoCache(): Promise<void> {
    if (localCollectionsLoaded) return;
    localCollectionsLoaded = true;

    const records = await readLocalCollections();
    for (const record of records) {
        trackCollection(record);
    }
}

async function readLocalOwnership(): Promise<AgentOwnershipRecord[]> {
    if (!canUseLocalFilesystem()) return [];

    try {
        const [{ readFile }, { join }] = await Promise.all([
            import('node:fs/promises'),
            import('node:path'),
        ]);
        const raw = await readFile(join(process.cwd(), LOCAL_OWNERSHIP_FILE), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((value): value is AgentOwnershipRecord => {
                return Boolean(
                    value
                    && typeof value === 'object'
                    && typeof (value as AgentOwnershipRecord).agentAddress === 'string'
                    && typeof (value as AgentOwnershipRecord).ownerAddress === 'string',
                );
            })
            .map((value) => ({
                ...value,
                agentAddress: normalizeAddress(value.agentAddress),
                agentPublicKey: value.agentPublicKey ? normalizePublicKey(value.agentPublicKey) : undefined,
                ownerAddress: normalizeAddress(value.ownerAddress),
                ownerPublicKey: value.ownerPublicKey ? normalizePublicKey(value.ownerPublicKey) : undefined,
                collectionContractAddress: value.collectionContractAddress
                    ? normalizeAddress(value.collectionContractAddress)
                    : undefined,
                collectionId: value.collectionId ? value.collectionId.trim() : undefined,
                txHash: value.txHash ?? undefined,
                registeredAt: value.registeredAt,
            }));
    } catch {
        return [];
    }
}

async function writeLocalOwnership(records: AgentOwnershipRecord[]): Promise<void> {
    if (!canUseLocalFilesystem()) return;

    try {
        const [{ writeFile }, { join }] = await Promise.all([
            import('node:fs/promises'),
            import('node:path'),
        ]);
        await writeFile(
            join(process.cwd(), LOCAL_OWNERSHIP_FILE),
            JSON.stringify(records, null, 2),
            'utf-8',
        );
    } catch {
        // Best-effort local fallback persistence only.
    }
}

async function loadLocalOwnershipIntoCache(): Promise<void> {
    if (localOwnershipLoaded) return;
    localOwnershipLoaded = true;

    const records = await readLocalOwnership();
    for (const record of records) {
        trackOwnership(record);
    }
}

async function readLocalImportedCollections(): Promise<ImportedCollectionRecord[]> {
    if (!canUseLocalFilesystem()) return [];

    try {
        const [{ readFile }, { join }] = await Promise.all([
            import('node:fs/promises'),
            import('node:path'),
        ]);
        const raw = await readFile(join(process.cwd(), LOCAL_IMPORTED_FILE), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((value): value is ImportedCollectionRecord => {
                return Boolean(
                    value
                    && typeof value === 'object'
                    && typeof (value as ImportedCollectionRecord).id === 'string'
                    && typeof (value as ImportedCollectionRecord).agentAddress === 'string'
                    && typeof (value as ImportedCollectionRecord).nftContractAddress === 'string',
                );
            })
            .map((value) => ({
                ...value,
                agentAddress: normalizeAddress(value.agentAddress),
                nftContractAddress: normalizeAddress(value.nftContractAddress),
                name: value.name ?? '',
                symbol: value.symbol ?? '',
                collectionBanner: value.collectionBanner ?? '',
                collectionIcon: value.collectionIcon ?? '',
                collectionWebsite: value.collectionWebsite ?? '',
                collectionDescription: value.collectionDescription ?? '',
                verified: Boolean(value.verified),
                importedAt: value.importedAt ?? new Date().toISOString(),
            }));
    } catch {
        return [];
    }
}

async function writeLocalImportedCollections(records: ImportedCollectionRecord[]): Promise<void> {
    if (!canUseLocalFilesystem()) return;

    try {
        const [{ writeFile }, { join }] = await Promise.all([
            import('node:fs/promises'),
            import('node:path'),
        ]);
        await writeFile(
            join(process.cwd(), LOCAL_IMPORTED_FILE),
            JSON.stringify(records, null, 2),
            'utf-8',
        );
    } catch {
        // Best-effort local fallback persistence only.
    }
}

async function loadLocalImportedCollectionsIntoCache(): Promise<void> {
    if (localImportedLoaded) return;
    localImportedLoaded = true;
    const records = await readLocalImportedCollections();
    for (const record of records) {
        trackImportedCollection(record);
    }
}

function mapCollectionRow(row: CollectionRow): CollectionRecord {
    return {
        contractAddress: normalizeAddress(row.contract_address),
        contractPublicKey: row.contract_public_key ? normalizePublicKey(row.contract_public_key) : undefined,
        creatorAgentAddress: normalizeAddress(row.creator_agent_address),
        creatorAgentPublicKey: row.creator_agent_public_key ? normalizePublicKey(row.creator_agent_public_key) : undefined,
        ownerAddress: normalizeAddress(row.owner_address),
        ownerPublicKey: row.owner_public_key ? normalizePublicKey(row.owner_public_key) : undefined,
        collectionId: row.collection_id ?? undefined,
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
        txHash: row.deployment_tx_hash,
        createdAt: row.created_at,
    };
}

function trackCollection(record: CollectionRecord): void {
    const contractAddress = normalizeAddress(record.contractAddress);
    const creatorAgentAddress = normalizeAddress(record.creatorAgentAddress);
    const ownerAddress = normalizeAddress(record.ownerAddress);
    const contractPublicKey = record.contractPublicKey
        ? normalizePublicKey(record.contractPublicKey)
        : undefined;
    const creatorAgentPublicKey = record.creatorAgentPublicKey
        ? normalizePublicKey(record.creatorAgentPublicKey)
        : undefined;
    const ownerPublicKey = record.ownerPublicKey
        ? normalizePublicKey(record.ownerPublicKey)
        : undefined;

    const normalized: CollectionRecord = {
        ...record,
        contractAddress,
        contractPublicKey,
        creatorAgentAddress,
        creatorAgentPublicKey,
        ownerAddress,
        ownerPublicKey,
        collectionId: record.collectionId ? record.collectionId.trim() : undefined,
        txHash: record.txHash ?? undefined,
    };

    collectionsByContract.set(contractAddress, normalized);
    collectionsByCreatorAgent.set(creatorAgentAddress, normalized);
    if (contractPublicKey) {
        contractPublicKeyByContract.set(contractAddress, contractPublicKey);
    }
    if (creatorAgentPublicKey) {
        agentPublicKeyByAgent.set(creatorAgentAddress, creatorAgentPublicKey);
    }
    if (ownerPublicKey) {
        ownerPublicKeyByAgent.set(creatorAgentAddress, ownerPublicKey);
    }
}

function trackOwnership(record: AgentOwnershipRecord): void {
    const agent = normalizeAddress(record.agentAddress);
    const owner = normalizeAddress(record.ownerAddress);
    const normalizedRecord: AgentOwnershipRecord = {
        ...record,
        agentAddress: agent,
        agentPublicKey: record.agentPublicKey
            ? normalizePublicKey(record.agentPublicKey)
            : undefined,
        ownerAddress: owner,
        ownerPublicKey: record.ownerPublicKey
            ? normalizePublicKey(record.ownerPublicKey)
            : undefined,
        collectionContractAddress: record.collectionContractAddress
            ? normalizeAddress(record.collectionContractAddress)
            : undefined,
        collectionId: record.collectionId ? record.collectionId.trim() : undefined,
    };

    const previousOwner = ownerByAgent.get(agent);
    if (previousOwner && previousOwner !== owner) {
        const prevSet = ownerAgents.get(previousOwner);
        if (prevSet) {
            prevSet.delete(agent);
            if (prevSet.size === 0) ownerAgents.delete(previousOwner);
        }
    }

    ownerByAgent.set(agent, owner);
    ownershipRecordByAgent.set(agent, normalizedRecord);
    if (normalizedRecord.agentPublicKey) {
        agentPublicKeyByAgent.set(agent, normalizedRecord.agentPublicKey);
    }
    if (normalizedRecord.ownerPublicKey) {
        ownerPublicKeyByAgent.set(agent, normalizedRecord.ownerPublicKey);
    }
    if (normalizedRecord.collectionContractAddress) {
        collectionContractByAgent.set(agent, normalizedRecord.collectionContractAddress);
    }
    if (normalizedRecord.collectionId) {
        collectionIdByAgent.set(agent, normalizedRecord.collectionId);
    } else {
        collectionIdByAgent.delete(agent);
    }
    const set = ownerAgents.get(owner) ?? new Set<string>();
    set.add(agent);
    ownerAgents.set(owner, set);
}

function trackImportedCollection(record: ImportedCollectionRecord): void {
    const agent = normalizeAddress(record.agentAddress);
    const contract = normalizeAddress(record.nftContractAddress);
    const normalized: ImportedCollectionRecord = {
        ...record,
        agentAddress: agent,
        nftContractAddress: contract,
        name: record.name ?? '',
        symbol: record.symbol ?? '',
        collectionBanner: record.collectionBanner ?? '',
        collectionIcon: record.collectionIcon ?? '',
        collectionWebsite: record.collectionWebsite ?? '',
        collectionDescription: record.collectionDescription ?? '',
        verified: Boolean(record.verified),
        importedAt: record.importedAt,
    };

    const existing = importedCollectionsByAgent.get(agent) ?? [];
    const filtered = existing.filter((item) => item.nftContractAddress !== contract);
    importedCollectionsByAgent.set(agent, [...filtered, normalized]);
    importedCollectionsByKey.set(importedKey(agent, contract), normalized);

    const agents = agentsByImportedContract.get(contract) ?? new Set<string>();
    agents.add(agent);
    agentsByImportedContract.set(contract, agents);
}

async function addColumnIfMissing(
    db: D1Database,
    table: string,
    column: string,
    type: string,
): Promise<void> {
    try {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`).run();
    } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (
            message.includes('duplicate column name')
            || message.includes('already exists')
        ) {
            return;
        }
        throw error;
    }
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

        await db.prepare(
            'CREATE TABLE IF NOT EXISTS collections ('
            + 'contract_address TEXT PRIMARY KEY,'
            + 'contract_public_key TEXT,'
            + 'creator_agent_address TEXT NOT NULL,'
            + 'creator_agent_public_key TEXT,'
            + 'owner_address TEXT NOT NULL,'
            + 'owner_public_key TEXT,'
            + 'collection_id TEXT,'
            + 'name TEXT NOT NULL,'
            + 'symbol TEXT NOT NULL,'
            + 'max_supply TEXT NOT NULL,'
            + 'base_uri TEXT NOT NULL,'
            + 'collection_banner TEXT NOT NULL,'
            + 'collection_icon TEXT NOT NULL,'
            + 'collection_website TEXT NOT NULL,'
            + 'collection_description TEXT NOT NULL,'
            + 'funding_tx_hash TEXT NOT NULL,'
            + 'deployment_tx_hash TEXT NOT NULL,'
            + 'created_at TEXT NOT NULL'
            + ');',
        ).run();

        await db.prepare(
            'CREATE INDEX IF NOT EXISTS idx_collections_creator_agent '
            + 'ON collections (creator_agent_address);',
        ).run();

        await db.prepare(
            'CREATE INDEX IF NOT EXISTS idx_collections_owner '
            + 'ON collections (owner_address);',
        ).run();

        await db.prepare(
            'CREATE TABLE IF NOT EXISTS agent_ownership ('
            + 'agent_address TEXT PRIMARY KEY,'
            + 'agent_public_key TEXT,'
            + 'owner_address TEXT NOT NULL,'
            + 'owner_public_key TEXT,'
            + 'collection_contract_address TEXT,'
            + 'collection_id TEXT,'
            + 'tx_hash TEXT,'
            + 'registered_at TEXT NOT NULL'
            + ');',
        ).run();

        await db.prepare(
            'CREATE INDEX IF NOT EXISTS idx_agent_ownership_owner '
            + 'ON agent_ownership (owner_address);',
        ).run();

        await addColumnIfMissing(db, 'collections', 'contract_public_key', 'TEXT');
        await addColumnIfMissing(db, 'collections', 'creator_agent_public_key', 'TEXT');
        await addColumnIfMissing(db, 'collections', 'owner_public_key', 'TEXT');
        await addColumnIfMissing(db, 'collections', 'collection_id', 'TEXT');
        await addColumnIfMissing(db, 'agent_ownership', 'agent_public_key', 'TEXT');
        await addColumnIfMissing(db, 'agent_ownership', 'collection_id', 'TEXT');

        await db.prepare(
            'CREATE TABLE IF NOT EXISTS imported_collections ('
            + 'id TEXT PRIMARY KEY,'
            + 'agent_address TEXT NOT NULL,'
            + 'nft_contract_address TEXT NOT NULL,'
            + 'name TEXT NOT NULL DEFAULT \'\','
            + 'symbol TEXT NOT NULL DEFAULT \'\','
            + 'collection_banner TEXT NOT NULL DEFAULT \'\','
            + 'collection_icon TEXT NOT NULL DEFAULT \'\','
            + 'collection_website TEXT NOT NULL DEFAULT \'\','
            + 'collection_description TEXT NOT NULL DEFAULT \'\','
            + 'verified BOOLEAN NOT NULL DEFAULT false,'
            + 'imported_at TEXT NOT NULL,'
            + 'UNIQUE(agent_address, nft_contract_address)'
            + ');',
        ).run();

        await db.prepare(
            'CREATE INDEX IF NOT EXISTS idx_imported_agent '
            + 'ON imported_collections (agent_address);',
        ).run();

        await db.prepare(
            'CREATE INDEX IF NOT EXISTS idx_imported_contract '
            + 'ON imported_collections (nft_contract_address);',
        ).run();

        schemaReady = true;
    })();

    try {
        await schemaPromise;
    } finally {
        schemaPromise = null;
    }
}

export async function saveCollection(record: CollectionRecord): Promise<void> {
    const ownershipRecord: AgentOwnershipRecord = {
        agentAddress: record.creatorAgentAddress,
        agentPublicKey: record.creatorAgentPublicKey,
        ownerAddress: record.ownerAddress,
        ownerPublicKey: record.ownerPublicKey,
        collectionContractAddress: record.contractAddress,
        collectionId: record.collectionId,
        txHash: record.txHash ?? record.deploymentTxHash,
        registeredAt: record.createdAt,
    };

    trackCollection(record);
    trackOwnership(ownershipRecord);

    await ensureSchema();
    const db = getD1Database();
    if (!db) {
        await writeLocalCollections([...collectionsByCreatorAgent.values()]);
        await writeLocalOwnership([...ownershipRecordByAgent.values()]);
        return;
    }

    if (!record.collectionId) {
        await db.prepare(`
INSERT INTO collections (
    contract_address,
    contract_public_key,
    creator_agent_address,
    creator_agent_public_key,
    owner_address,
    owner_public_key,
    collection_id,
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
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(contract_address) DO UPDATE SET
    contract_public_key = excluded.contract_public_key,
    creator_agent_address = excluded.creator_agent_address,
    creator_agent_public_key = excluded.creator_agent_public_key,
    owner_address = excluded.owner_address,
    owner_public_key = excluded.owner_public_key,
    collection_id = excluded.collection_id,
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
                record.contractPublicKey ? normalizePublicKey(record.contractPublicKey) : null,
                normalizeAddress(record.creatorAgentAddress),
                record.creatorAgentPublicKey ? normalizePublicKey(record.creatorAgentPublicKey) : null,
                normalizeAddress(record.ownerAddress),
                record.ownerPublicKey ? normalizePublicKey(record.ownerPublicKey) : null,
                record.collectionId ?? null,
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

    await saveAgentOwnership(ownershipRecord);
}

export async function getCollectionByCreatorAgent(
    creatorAgentAddress: string,
): Promise<CollectionRecord | null> {
    const normalized = normalizeAddress(creatorAgentAddress);
    const cached = collectionsByCreatorAgent.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) {
        await loadLocalCollectionsIntoCache();
        return collectionsByCreatorAgent.get(normalized) ?? null;
    }

    const row = await db.prepare(`
SELECT
    contract_address,
    contract_public_key,
    creator_agent_address,
    creator_agent_public_key,
    owner_address,
    owner_public_key,
    collection_id,
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

export async function listCollectionsByCreatorAgent(
    creatorAgentAddress: string,
): Promise<CollectionRecord[]> {
    const normalized = normalizeAddress(creatorAgentAddress);
    await loadLocalCollectionsIntoCache();
    const cached = collectionsByCreatorAgent.get(normalized);
    const fromCache = cached ? [cached] : [];

    await ensureSchema();
    const db = getD1Database();
    if (!db) return fromCache;

    const rows = await db.prepare(`
SELECT
    contract_address,
    contract_public_key,
    creator_agent_address,
    creator_agent_public_key,
    owner_address,
    owner_public_key,
    collection_id,
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
    `)
        .bind(normalized)
        .all<CollectionRow>();

    const mapped = (rows.results ?? []).map((row) => mapCollectionRow(row));
    for (const record of mapped) {
        trackCollection(record);
    }

    if (mapped.length === 0) return fromCache;
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
    if (!db) {
        await loadLocalCollectionsIntoCache();
        return collectionsByContract.get(normalized) ?? null;
    }

    const row = await db.prepare(`
SELECT
    contract_address,
    contract_public_key,
    creator_agent_address,
    creator_agent_public_key,
    owner_address,
    owner_public_key,
    collection_id,
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
    await loadLocalCollectionsIntoCache();

    const fromCache = new Set<string>([...collectionsByContract.keys()]);
    const normalizedHubAddress = CONTRACT_ADDRESSES.nftHub.trim().toLowerCase();
    if (normalizedHubAddress) {
        fromCache.add(normalizedHubAddress);
    }
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
    if (!db) {
        await writeLocalOwnership([...ownershipRecordByAgent.values()]);
        return;
    }

    await db.prepare(`
INSERT INTO agent_ownership (
    agent_address,
    agent_public_key,
    owner_address,
    owner_public_key,
    collection_contract_address,
    collection_id,
    tx_hash,
    registered_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_address) DO UPDATE SET
    agent_public_key = excluded.agent_public_key,
    owner_address = excluded.owner_address,
    owner_public_key = excluded.owner_public_key,
    collection_contract_address = excluded.collection_contract_address,
    collection_id = excluded.collection_id,
    tx_hash = excluded.tx_hash,
    registered_at = excluded.registered_at
    `)
        .bind(
            normalizeAddress(record.agentAddress),
            record.agentPublicKey ? normalizePublicKey(record.agentPublicKey) : null,
            normalizeAddress(record.ownerAddress),
            record.ownerPublicKey ? normalizePublicKey(record.ownerPublicKey) : null,
            record.collectionContractAddress
                ? normalizeAddress(record.collectionContractAddress)
                : null,
            record.collectionId ?? null,
            record.txHash ?? null,
            record.registeredAt,
        )
        .run();

}

export async function getAgentOwnerAddress(agentAddress: string): Promise<string | null> {
    await loadLocalOwnershipIntoCache();
    const normalized = normalizeAddress(agentAddress);
    const cached = ownerByAgent.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT
    agent_address,
    agent_public_key,
    owner_address,
    owner_public_key,
    collection_contract_address,
    collection_id,
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
        agentPublicKey: row.agent_public_key ?? undefined,
        ownerAddress: row.owner_address,
        ownerPublicKey: row.owner_public_key ?? undefined,
        collectionContractAddress: row.collection_contract_address ?? undefined,
        collectionId: row.collection_id ?? undefined,
        txHash: row.tx_hash ?? undefined,
        registeredAt: row.registered_at,
    });

    return normalizeAddress(row.owner_address);
}

export async function getAgentsByOwnerAddress(ownerAddress: string): Promise<string[]> {
    await loadLocalOwnershipIntoCache();
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

export async function getAgentCollectionContractAddress(agentAddress: string): Promise<string | null> {
    await loadLocalOwnershipIntoCache();
    const normalized = normalizeAddress(agentAddress);
    const cached = collectionContractByAgent.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT collection_contract_address
FROM agent_ownership
WHERE agent_address = ?
LIMIT 1
    `)
        .bind(normalized)
        .first<{ collection_contract_address: string | null }>();

    if (!row?.collection_contract_address) return null;
    const normalizedContract = normalizeAddress(row.collection_contract_address);
    collectionContractByAgent.set(normalized, normalizedContract);
    return normalizedContract;
}

export async function getAgentCollectionId(agentAddress: string): Promise<string | null> {
    await loadLocalOwnershipIntoCache();
    const normalized = normalizeAddress(agentAddress);
    const cached = collectionIdByAgent.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT collection_id
FROM agent_ownership
WHERE agent_address = ?
LIMIT 1
    `)
        .bind(normalized)
        .first<{ collection_id: string | null }>();

    if (!row?.collection_id) return null;
    const normalizedCollectionId = row.collection_id.trim();
    collectionIdByAgent.set(normalized, normalizedCollectionId);
    return normalizedCollectionId;
}

export async function getAgentPublicKey(agentAddress: string): Promise<string | null> {
    await loadLocalOwnershipIntoCache();
    const normalized = normalizeAddress(agentAddress);
    const cached = agentPublicKeyByAgent.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT agent_public_key
FROM agent_ownership
WHERE agent_address = ?
LIMIT 1
    `)
        .bind(normalized)
        .first<{ agent_public_key: string | null }>();

    if (!row?.agent_public_key) return null;
    const normalizedPublicKey = normalizePublicKey(row.agent_public_key);
    agentPublicKeyByAgent.set(normalized, normalizedPublicKey);
    return normalizedPublicKey;
}

export async function getCollectionContractPublicKey(
    contractAddress: string,
): Promise<string | null> {
    const normalized = normalizeAddress(contractAddress);
    const cached = contractPublicKeyByContract.get(normalized);
    if (cached) return cached;

    await ensureSchema();
    const db = getD1Database();
    if (!db) return null;

    const row = await db.prepare(`
SELECT contract_public_key
FROM collections
WHERE contract_address = ?
LIMIT 1
    `)
        .bind(normalized)
        .first<{ contract_public_key: string | null }>();

    if (!row?.contract_public_key) return null;
    const normalizedPublicKey = normalizePublicKey(row.contract_public_key);
    contractPublicKeyByContract.set(normalized, normalizedPublicKey);
    return normalizedPublicKey;
}

function ensureImportedRecord(record: ImportedCollectionRecord): ImportedCollectionRecord {
    return {
        ...record,
        agentAddress: normalizeAddress(record.agentAddress),
        nftContractAddress: normalizeAddress(record.nftContractAddress),
        name: record.name ?? '',
        symbol: record.symbol ?? '',
        collectionBanner: record.collectionBanner ?? '',
        collectionIcon: record.collectionIcon ?? '',
        collectionWebsite: record.collectionWebsite ?? '',
        collectionDescription: record.collectionDescription ?? '',
        verified: Boolean(record.verified),
        importedAt: record.importedAt || new Date().toISOString(),
    };
}

async function writeImportedLocalCache(): Promise<void> {
    const records = [...importedCollectionsByAgent.values()].flat();
    await writeLocalImportedCollections(records);
}

export async function saveImportedCollection(record: ImportedCollectionRecord): Promise<ImportedCollectionRecord> {
    const normalized = ensureImportedRecord({
        ...record,
        id: record.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    });

    trackImportedCollection(normalized);

    await ensureSchema();
    const db = getD1Database();
    if (!db) {
        await writeImportedLocalCache();
        return normalized;
    }

    await db.prepare(`
INSERT INTO imported_collections (
    id,
    agent_address,
    nft_contract_address,
    name,
    symbol,
    collection_banner,
    collection_icon,
    collection_website,
    collection_description,
    verified,
    imported_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_address, nft_contract_address) DO UPDATE SET
    name = excluded.name,
    symbol = excluded.symbol,
    collection_banner = excluded.collection_banner,
    collection_icon = excluded.collection_icon,
    collection_website = excluded.collection_website,
    collection_description = excluded.collection_description,
    verified = excluded.verified,
    imported_at = excluded.imported_at,
    id = excluded.id
    `)
        .bind(
            normalized.id,
            normalized.agentAddress,
            normalized.nftContractAddress,
            normalized.name,
            normalized.symbol,
            normalized.collectionBanner,
            normalized.collectionIcon,
            normalized.collectionWebsite,
            normalized.collectionDescription,
            normalized.verified ? 1 : 0,
            normalized.importedAt,
        )
        .run();

    return normalized;
}

async function loadImportedFromDb(): Promise<void> {
    if (importedDbLoaded) return;
    importedDbLoaded = true;
    await ensureSchema();
    const db = getD1Database();
    if (!db) return;

    const rows = await db.prepare(`
SELECT
    id,
    agent_address,
    nft_contract_address,
    name,
    symbol,
    collection_banner,
    collection_icon,
    collection_website,
    collection_description,
    verified,
    imported_at
FROM imported_collections
    `)
        .all<{
            id: string;
            agent_address: string;
            nft_contract_address: string;
            name: string;
            symbol: string;
            collection_banner: string;
            collection_icon: string;
            collection_website: string;
            collection_description: string;
            verified: number;
            imported_at: string;
        }>();

    for (const row of rows.results ?? []) {
        trackImportedCollection({
            id: row.id,
            agentAddress: row.agent_address,
            nftContractAddress: row.nft_contract_address,
            name: row.name,
            symbol: row.symbol,
            collectionBanner: row.collection_banner,
            collectionIcon: row.collection_icon,
            collectionWebsite: row.collection_website,
            collectionDescription: row.collection_description,
            verified: Boolean(row.verified),
            importedAt: row.imported_at,
        });
    }
}

async function ensureImportedCache(): Promise<void> {
    await loadLocalImportedCollectionsIntoCache();
    await loadImportedFromDb();
}

export async function getImportedCollection(
    agentAddress: string,
    contractAddress: string,
): Promise<ImportedCollectionRecord | null> {
    if (!localImportedLoaded) {
        await ensureImportedCache();
    }

    const key = importedKey(normalizeAddress(agentAddress), normalizeAddress(contractAddress));
    return importedCollectionsByKey.get(key) ?? null;
}

export async function getImportedCollectionsByAgent(
    agentAddress: string,
): Promise<ImportedCollectionRecord[]> {
    if (!localImportedLoaded) {
        await ensureImportedCache();
    }

    const records = importedCollectionsByAgent.get(normalizeAddress(agentAddress));
    return records ? [...records] : [];
}

export async function getAgentsByImportedContract(contractAddress: string): Promise<string[]> {
    if (!localImportedLoaded) {
        await ensureImportedCache();
    }

    const set = agentsByImportedContract.get(normalizeAddress(contractAddress));
    return set ? [...set] : [];
}

export async function countImportedCollections(agentAddress: string): Promise<number> {
    if (!localImportedLoaded) {
        await ensureImportedCache();
    }

    const records = importedCollectionsByAgent.get(normalizeAddress(agentAddress));
    return records ? records.length : 0;
}
