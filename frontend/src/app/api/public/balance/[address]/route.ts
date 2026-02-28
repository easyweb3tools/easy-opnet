import { NextResponse } from "next/server";
import { isBackendProxyEnabled, proxyApiRequest } from "@/lib/backend-proxy";

function fallbackBalanceFor(address: string): string {
  // Deterministic mock value, only used when backend proxy is unavailable.
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  return String((hash % 5_000_000) + 100_000);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: rawAddress } = await params;
  const address = decodeURIComponent(rawAddress);

  const proxied = await proxyApiRequest(
    request,
    `/api/public/balance/${encodeURIComponent(address)}`,
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
      address,
      balance: fallbackBalanceFor(address),
    },
  });
}
