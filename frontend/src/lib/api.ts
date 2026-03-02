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
  AgentRequestAuth,
  RegisterAgentRequest,
  MintRequest,
  ListRequest,
  BidRequest,
  BuyRequest,
  CancelRequest,
  DeployCollectionRequest,
  DeployCollectionResponse,
  OwnedAgentsResponse,
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

const USE_DIRECT_BACKEND = process.env.NEXT_PUBLIC_USE_DIRECT_BACKEND === "1";
const DIRECT_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
const BASE_URL = USE_DIRECT_BACKEND && DIRECT_BACKEND_URL
  ? `${DIRECT_BACKEND_URL}/api`
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

export function fetchAgentsByOwner(address: string): Promise<OwnedAgentsResponse> {
  return request<OwnedAgentsResponse>(
    `/public/agents-by-owner/${encodeURIComponent(address)}`,
  );
}

// ── Agent endpoints ──

function getBodyAddress(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = (body as { address?: unknown }).address;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
}

function agentRequest<T>(
  path: string,
  body: unknown,
  auth: AgentRequestAuth,
): Promise<T> {
  const headers: Record<string, string> = {
    "X-Agent-Signature": auth.signature,
    "X-Agent-PublicKey": auth.publicKey,
  };

  const address = getBodyAddress(body);
  if (address) {
    headers["X-Agent-Address"] = address;
  }

  return request<T>(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function registerAgent(
  req: RegisterAgentRequest,
  auth: AgentRequestAuth,
): Promise<AgentActionResponse> {
  return agentRequest("/agent/register", req, auth);
}

export function mintNft(
  req: MintRequest,
  auth: AgentRequestAuth,
): Promise<AgentActionResponse> {
  return agentRequest("/agent/mint", req, auth);
}

export function listNft(
  req: ListRequest,
  auth: AgentRequestAuth,
): Promise<AgentActionResponse> {
  return agentRequest("/agent/list", req, auth);
}

export function placeBid(
  req: BidRequest,
  auth: AgentRequestAuth,
): Promise<AgentActionResponse> {
  return agentRequest("/agent/bid", req, auth);
}

export function buyNft(
  req: BuyRequest,
  auth: AgentRequestAuth,
): Promise<AgentActionResponse> {
  return agentRequest("/agent/buy", req, auth);
}

export function cancelListing(
  req: CancelRequest,
  auth: AgentRequestAuth,
): Promise<AgentActionResponse> {
  return agentRequest("/agent/cancel", req, auth);
}

export function deployCollection(
  req: DeployCollectionRequest,
  auth: AgentRequestAuth,
): Promise<DeployCollectionResponse> {
  return agentRequest("/agent/create-collection", req, auth);
}

export interface WalletSignatureResult {
  readonly signature: string;
}

export async function buildAgentRequestAuth(
  body: unknown,
  mldsaPublicKey: string | null,
  signMLDSAMessage: (message: string) => Promise<WalletSignatureResult | null>,
): Promise<AgentRequestAuth> {
  if (!mldsaPublicKey) {
    throw new ApiError(401, "Wallet ML-DSA public key is missing");
  }

  const payload = JSON.stringify(body);
  const signatureResult = await signMLDSAMessage(payload);
  if (!signatureResult?.signature) {
    throw new ApiError(401, "Wallet signature rejected");
  }

  return {
    signature: signatureResult.signature,
    publicKey: mldsaPublicKey,
  };
}
