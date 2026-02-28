import { NextResponse } from "next/server";
import { findAgent, getAgentNfts, getAgentListings, getAgentActivity } from "@/lib/mock-data";
import { isBackendProxyEnabled, proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);
  const proxied = await proxyApiRequest(
    request,
    `/api/public/agent/${encodeURIComponent(decodedAddress)}`,
  );
  if (proxied) return proxied;
  if (isBackendProxyEnabled()) {
    return NextResponse.json(
      { success: false, error: "Backend API unavailable" },
      { status: 502 },
    );
  }

  const agent = findAgent(decodedAddress);

  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  const nfts = getAgentNfts(agent.address);
  const listings = getAgentListings(agent.address);
  const activity = getAgentActivity(agent.address);

  return NextResponse.json({
    success: true,
    data: { agent, nfts, listings, activity },
  });
}
