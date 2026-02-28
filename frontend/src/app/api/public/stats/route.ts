import { NextResponse } from "next/server";
import { MOCK_STATS } from "@/lib/mock-data";
import { proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(request: Request) {
  const proxied = await proxyApiRequest(request, "/api/public/stats");
  if (proxied) return proxied;

  return NextResponse.json({
    success: true,
    data: MOCK_STATS,
  });
}
