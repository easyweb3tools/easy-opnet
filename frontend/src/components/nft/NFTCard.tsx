import Link from "next/link";
import type { NFT } from "@/types";
import { formatPrice } from "@/lib/format";

export function NFTCard({
  nft,
  price,
  href,
  className = "",
}: {
  readonly nft: NFT;
  readonly price?: string;
  readonly href?: string;
  readonly className?: string;
}) {
  const link = href ?? `/nft/${nft.tokenId}`;

  return (
    <Link
      href={link}
      className={`group block overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-200 hover:scale-[1.02] hover:border-accent/50 hover:shadow-[0_0_30px_-5px_rgba(41,151,255,0.15)] ${className}`}
    >
      {/* Image */}
      <div className="aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={nft.imageUrl}
          alt={nft.name}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-text-primary">
          {nft.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-text-secondary">
          {nft.collectionName}
        </p>
        {price && (
          <p className="mt-2 font-mono text-sm font-medium text-accent">
            {formatPrice(price)}
          </p>
        )}
      </div>
    </Link>
  );
}
