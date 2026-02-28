import type { ActivityEvent, ActivityEventType } from '../types/index.js';

const MAX_EVENTS = 1000;
let events: ActivityEvent[] = [];
let nextId = 1;

export interface RecordEventInput {
    readonly type: ActivityEventType;
    readonly agent: string;
    readonly agentName?: string;
    readonly tokenId?: string;
    readonly nftName?: string;
    readonly listingId?: string;
    readonly amount?: string;
    readonly txHash: string;
}

export interface ActivityQuery {
    readonly type?: ActivityEventType | 'all';
    readonly agent?: string;
    readonly limit?: number;
    readonly offset?: number;
}

export function record(input: RecordEventInput): ActivityEvent {
    const event: ActivityEvent = {
        id: `evt-${nextId++}`,
        type: input.type,
        agent: input.agent,
        agentName: input.agentName ?? '',
        tokenId: input.tokenId ?? null,
        nftName: input.nftName ?? null,
        listingId: input.listingId ?? null,
        amount: input.amount ?? null,
        timestamp: new Date().toISOString(),
        txHash: input.txHash,
    };

    events.unshift(event);

    if (events.length > MAX_EVENTS) {
        events = events.slice(0, MAX_EVENTS);
    }

    return event;
}

export function query(params: ActivityQuery = {}): { items: ActivityEvent[]; total: number } {
    const { type = 'all', agent, limit = 20, offset = 0 } = params;

    let filtered = events;

    if (type !== 'all') {
        filtered = filtered.filter((e) => e.type === type);
    }
    if (agent) {
        filtered = filtered.filter((e) => e.agent === agent);
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    return { items, total };
}

export function getEventsByAgent(agent: string): ActivityEvent[] {
    return events.filter((e) => e.agent === agent);
}

export function getRecentSales(withinMs: number): ActivityEvent[] {
    const cutoff = Date.now() - withinMs;
    return events.filter(
        (e) => e.type === 'sale' && new Date(e.timestamp).getTime() >= cutoff,
    );
}

export function getAllEvents(): readonly ActivityEvent[] {
    return events;
}
