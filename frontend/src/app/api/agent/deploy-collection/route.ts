import { NextResponse, type NextRequest } from "next/server";
import { isBackendProxyEnabled, proxyApiRequest } from "@/lib/backend-proxy";

export async function POST(request: NextRequest) {
  const proxied = await proxyApiRequest(request, "/api/agent/deploy-collection");
  if (proxied) return proxied;

  if (isBackendProxyEnabled()) {
    return NextResponse.json(
      { success: false, error: "Backend API unavailable" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: "deploy-collection requires backend proxy; set BACKEND_BASE_URL",
    },
    { status: 501 },
  );
}
