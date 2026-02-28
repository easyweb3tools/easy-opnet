import { notFound } from "next/navigation";
import { findNft } from "@/lib/mock-data";
import { NFTDetail } from "@/components/nft/NFTDetail";

export default async function NFTDetailPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;
  const nft = findNft(tokenId);

  if (!nft) notFound();

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <NFTDetail nft={nft} />

      {/* Provenance */}
      <section className="mt-12">
        <h2 className="mb-6 text-xl font-bold text-text-primary">Provenance</h2>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <span className="text-sm text-text-secondary">Minted</span>
              <span className="text-sm text-text-primary">
                {new Date(nft.mintedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Token URI</span>
              <span className="font-mono text-xs text-accent">{nft.tokenUri}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
