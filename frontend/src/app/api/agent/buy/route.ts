import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
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
      txHash: `0xmock_buy_${Date.now().toString(16)}`,
      tokenId: "1",
    },
  });
}
