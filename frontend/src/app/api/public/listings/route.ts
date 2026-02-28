import { NextResponse, type NextRequest } from "next/server";
import { MOCK_LISTINGS } from "@/lib/mock-data";
import type { ListingSortOption } from "@/types";
import { proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(request: NextRequest) {
  const proxied = await proxyApiRequest(request, "/api/public/listings");
  if (proxied) return proxied;

  const params = request.nextUrl.searchParams;
  const sort = (params.get("sort") ?? "newest") as ListingSortOption;
  const status = params.get("status") ?? "active";
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  const limit = Math.min(Number(params.get("limit") ?? 20), 100);
  const offset = Number(params.get("offset") ?? 0);

  let filtered = [...MOCK_LISTINGS];

  // Status filter
  if (status !== "all") {
    filtered = filtered.filter((l) => l.status === status);
  }

  // Price filters
  if (minPrice) {
    filtered = filtered.filter((l) => Number(l.price) >= Number(minPrice));
  }
  if (maxPrice) {
    filtered = filtered.filter((l) => Number(l.price) <= Number(maxPrice));
  }

  // Sort
  switch (sort) {
    case "price_asc":
      filtered.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case "price_desc":
      filtered.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case "most_bids":
      filtered.sort((a, b) => b.bidCount - a.bidCount);
      break;
    case "ending_soon":
      filtered.sort((a, b) => {
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      });
      break;
    case "newest":
    default:
      filtered.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    success: true,
    data: { items, total, offset, limit },
  });
}
