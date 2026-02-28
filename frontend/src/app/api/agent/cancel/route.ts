import { NextResponse, type NextRequest } from "next/server";
import { isBackendProxyEnabled, proxyApiRequest } from "@/lib/backend-proxy";

export async function POST(request: NextRequest) {
  const proxied = await proxyApiRequest(request, "/api/agent/cancel");
  if (proxied) return proxied;
  if (isBackendProxyEnabled()) {
    return NextResponse.json(
      { success: false, error: "Backend API unavailable" },
      { status: 502 },
    );
  }

  const signature = request.headers.get("X-Agent-Signature");
  const publicKey = request.headers.get("X-Agent-PublicKey");

  if (!signature || !publicKey) {
    return NextResponse.json(
      { success: false, error: "Missing agent authentication headers" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as { listingId?: string };

  if (!body.listingId) {
    return NextResponse.json(
      { success: false, error: "listingId is required" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      txHash: `0xmock_cancel_${Date.now().toString(16)}`,
    },
  });
}
