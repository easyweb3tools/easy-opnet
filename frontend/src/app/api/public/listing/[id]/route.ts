import { NextResponse } from "next/server";
import { findListing, getBidsForListing } from "@/lib/mock-data";
import { proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const proxied = await proxyApiRequest(
    request,
    `/api/public/listing/${encodeURIComponent(id)}`,
  );
  if (proxied) return proxied;

  const listing = findListing(id);

  if (!listing) {
    return NextResponse.json(
      { success: false, error: "Listing not found" },
      { status: 404 },
    );
  }

  const bids = getBidsForListing(id);

  return NextResponse.json({
    success: true,
    data: { listing, bids },
  });
}
