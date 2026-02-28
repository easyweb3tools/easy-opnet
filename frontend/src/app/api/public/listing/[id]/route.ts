import { NextResponse } from "next/server";
import { findListing, getBidsForListing } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
