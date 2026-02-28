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

  const body = (await request.json()) as { metadata?: unknown };

  if (!body.metadata) {
    return NextResponse.json(
      { success: false, error: "metadata is required" },
      { status: 400 },
    );
  }

  const tokenId = Math.floor(Math.random() * 10000).toString();

  return NextResponse.json({
    success: true,
    data: {
      txHash: `0xmock_mint_${Date.now().toString(16)}`,
      tokenId,
    },
  });
}
