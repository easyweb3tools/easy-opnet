import { NextResponse } from "next/server";
import { findNft } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;
  const nft = findNft(tokenId);

  if (!nft) {
    return NextResponse.json(
      { success: false, error: "NFT not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: nft,
  });
}
