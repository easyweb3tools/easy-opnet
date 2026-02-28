import { NextResponse, type NextRequest } from "next/server";
import { MOCK_ACTIVITY } from "@/lib/mock-data";
import type { ActivityFilterType } from "@/types";
import { proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(request: NextRequest) {
  const proxied = await proxyApiRequest(request, "/api/public/activity");
  if (proxied) return proxied;

  const params = request.nextUrl.searchParams;
  const type = (params.get("type") ?? "all") as ActivityFilterType;
  const limit = Math.min(Number(params.get("limit") ?? 20), 100);
  const offset = Number(params.get("offset") ?? 0);

  let filtered = [...MOCK_ACTIVITY];

  if (type !== "all") {
    filtered = filtered.filter((e) => e.type === type);
  }

  // Sort by timestamp descending
  filtered.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    success: true,
    data: { items, total, offset, limit },
  });
}
