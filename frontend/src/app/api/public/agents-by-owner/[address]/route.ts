import { NextResponse } from "next/server";
import { isBackendProxyEnabled, proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);
  const proxied = await proxyApiRequest(
    request,
    `/api/public/agents-by-owner/${encodeURIComponent(decodedAddress)}`,
  );

  if (proxied) return proxied;
  if (isBackendProxyEnabled()) {
    return NextResponse.json(
      { success: false, error: "Backend API unavailable" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ownerAddress: decodedAddress,
      agents: [],
    },
  });
}
