import { NextResponse, type NextRequest } from "next/server";
import { proxyApiRequest } from "@/lib/backend-proxy";

export async function POST(request: NextRequest) {
  const proxied = await proxyApiRequest(request, "/api/agent/bid");
  if (proxied) return proxied;

  const signature = request.headers.get("X-Agent-Signature");
  const publicKey = request.headers.get("X-Agent-PublicKey");

  if (!signature || !publicKey) {
    return NextResponse.json(
      { success: false, error: "Missing agent authentication headers" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as { listingId?: string; amount?: string };

  if (!body.listingId || !body.amount) {
    return NextResponse.json(
      { success: false, error: "listingId and amount are required" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      txHash: `0xmock_bid_${Date.now().toString(16)}`,
      bidId: `bid-mock-${Date.now().toString(16)}`,
    },
  });
}
