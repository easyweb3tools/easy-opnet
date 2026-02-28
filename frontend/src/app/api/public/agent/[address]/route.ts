import { NextResponse } from "next/server";
import { findAgent, getAgentNfts, getAgentListings, getAgentActivity } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const agent = findAgent(decodeURIComponent(address));

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
