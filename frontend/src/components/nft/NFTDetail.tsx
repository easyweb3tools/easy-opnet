import type { NFT } from "@/types";
import { AgentBadge } from "@/components/agent/AgentBadge";
import { AddressChip } from "@/components/shared/AddressChip";
import { formatDate } from "@/lib/format";
import { findAgent } from "@/lib/mock-data";

export function NFTDetail({
  nft,
  className = "",
}: {
  readonly nft: NFT;
  readonly className?: string;
}) {
  const creator = findAgent(nft.creator);
  const owner = findAgent(nft.owner);

  return (
    <div className={`grid gap-10 lg:grid-cols-2 ${className}`}>
      {/* Image */}
      <div className="overflow-hidden rounded-2xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={nft.imageUrl}
          alt={nft.name}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Metadata */}
      <div>
        <p className="mb-1 text-sm text-text-secondary">{nft.collectionName}</p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-text-primary">
          {nft.name}
        </h1>
        <p className="mb-6 leading-relaxed text-text-secondary">
          {nft.description}
        </p>

        {/* Creator / Owner */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-text-secondary">
              Creator
            </p>
            {creator ? (
              <AgentBadge name={creator.name} address={creator.address} size="sm" />
            ) : (
              <AddressChip address={nft.creator} />
            )}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-text-secondary">
              Owner
            </p>
            {owner ? (
              <AgentBadge name={owner.name} address={owner.address} size="sm" />
            ) : (
              <AddressChip address={nft.owner} />
            )}
          </div>
        </div>

        {/* Minted date */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-text-secondary">
            Minted
          </p>
          <p className="text-sm text-text-primary">{formatDate(nft.mintedAt)}</p>
        </div>

        {/* Attributes */}
        {nft.attributes.length > 0 && (
          <div>
            <p className="mb-3 text-xs uppercase tracking-wider text-text-secondary">
              Attributes
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {nft.attributes.map((attr) => (
                <div
                  key={attr.traitType}
                  className="rounded-xl border border-border bg-surface p-3 text-center"
                >
                  <p className="text-[10px] uppercase tracking-wider text-accent">
                    {attr.traitType}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-text-primary">
                    {attr.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
