import { NextResponse } from "next/server";
import { findNft } from "@/lib/mock-data";
import { proxyApiRequest } from "@/lib/backend-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;
  const proxied = await proxyApiRequest(
    request,
    `/api/public/nft/${encodeURIComponent(tokenId)}`,
  );
  if (proxied) return proxied;

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
