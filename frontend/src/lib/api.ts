import type {
  ApiResponse,
  PaginatedResponse,
  Listing,
  NFT,
  Agent,
  ActivityEvent,
  MarketplaceStats,
  ListingQueryParams,
  ActivityQueryParams,
  AgentActionResponse,
  MintRequest,
  ListRequest,
  BidRequest,
  BuyRequest,
  CancelRequest,
} from "@/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`
  : "/api";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new ApiError(400, json.error ?? "Unknown error");
  }
  return json.data;
}

function toSearchParams(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      sp.set(key, String(value));
    }
  }
  const str = sp.toString();
  return str ? `?${str}` : "";
}

// ── Public endpoints ──

export function fetchStats(): Promise<MarketplaceStats> {
  return request<MarketplaceStats>("/public/stats");
}

export function fetchListings(
  params: ListingQueryParams = {},
): Promise<PaginatedResponse<Listing>> {
  return request<PaginatedResponse<Listing>>(
    `/public/listings${toSearchParams(params as Record<string, unknown>)}`,
  );
}

export function fetchListing(
  id: string,
): Promise<{ listing: Listing; bids: readonly import("@/types").Bid[] }> {
  return request(`/public/listing/${encodeURIComponent(id)}`);
}

export function fetchNft(tokenId: string): Promise<NFT> {
  return request<NFT>(`/public/nft/${encodeURIComponent(tokenId)}`);
}

export function fetchAgent(
  address: string,
): Promise<{ agent: Agent; nfts: readonly NFT[]; listings: readonly Listing[] }> {
  return request(`/public/agent/${encodeURIComponent(address)}`);
}

export function fetchActivity(
  params: ActivityQueryParams = {},
): Promise<PaginatedResponse<ActivityEvent>> {
  return request<PaginatedResponse<ActivityEvent>>(
    `/public/activity${toSearchParams(params as Record<string, unknown>)}`,
  );
}

// ── Agent endpoints (stub) ──

function agentRequest<T>(
  path: string,
  body: unknown,
  signature = "mock-signature",
  publicKey = "mock-public-key",
): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: {
      "X-Agent-Signature": signature,
      "X-Agent-PublicKey": publicKey,
    },
    body: JSON.stringify(body),
  });
}

export function registerAgent(
  publicKey: string,
  proof: string,
): Promise<AgentActionResponse> {
  return agentRequest("/agent/register", { publicKey, proof });
}

export function mintNft(req: MintRequest): Promise<AgentActionResponse> {
  return agentRequest("/agent/mint", req);
}

export function listNft(req: ListRequest): Promise<AgentActionResponse> {
  return agentRequest("/agent/list", req);
}

export function placeBid(req: BidRequest): Promise<AgentActionResponse> {
  return agentRequest("/agent/bid", req);
}

export function buyNft(req: BuyRequest): Promise<AgentActionResponse> {
  return agentRequest("/agent/buy", req);
}

export function cancelListing(req: CancelRequest): Promise<AgentActionResponse> {
  return agentRequest("/agent/cancel", req);
}
