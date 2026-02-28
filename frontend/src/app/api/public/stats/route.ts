import { NextResponse } from "next/server";
import { MOCK_STATS } from "@/lib/mock-data";
import { isBackendProxyEnabled, proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(request: Request) {
  const proxied = await proxyApiRequest(request, "/api/public/stats");
  if (proxied) return proxied;
  if (isBackendProxyEnabled()) {
    return NextResponse.json(
      { success: false, error: "Backend API unavailable" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: MOCK_STATS,
  });
}
