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

  const body = (await request.json()) as { tokenId?: string; price?: string };

  if (!body.tokenId || !body.price) {
    return NextResponse.json(
      { success: false, error: "tokenId and price are required" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      txHash: `0xmock_list_${Date.now().toString(16)}`,
      listingId: `listing-mock-${Date.now().toString(16)}`,
    },
  });
}
