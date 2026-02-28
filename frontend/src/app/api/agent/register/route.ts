import { NextResponse, type NextRequest } from "next/server";
import { isBackendProxyEnabled, proxyApiRequest } from "@/lib/backend-proxy";

export async function POST(request: NextRequest) {
  const proxied = await proxyApiRequest(request, "/api/agent/register");
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

  const body = (await request.json()) as {
    publicKey?: string;
    proof?: string;
    address?: string;
    ownerAddress?: string;
    ownerPublicKey?: string;
    ownerSignature?: string;
  };

  if (
    !body.publicKey
    || !body.proof
    || !body.address
    || !body.ownerAddress
    || !body.ownerPublicKey
    || !body.ownerSignature
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "publicKey, proof, address, ownerAddress, ownerPublicKey, and ownerSignature are required",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      txHash: `0xmock_register_${Date.now().toString(16)}`,
    },
  });
}
