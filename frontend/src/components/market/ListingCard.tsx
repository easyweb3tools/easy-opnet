import Link from "next/link";
import type { Listing } from "@/types";
import { formatPrice } from "@/lib/format";

export function ListingCard({
  listing,
  className = "",
}: {
  readonly listing: Listing;
  readonly className?: string;
}) {
  const isAuction = listing.auctionDuration > 0;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className={`group block overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-200 hover:scale-[1.02] hover:border-accent/50 hover:shadow-[0_0_30px_-5px_rgba(41,151,255,0.15)] ${className}`}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.nft.imageUrl}
          alt={listing.nft.name}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
        {/* Status badge */}
        {listing.status !== "active" && (
          <div className="absolute right-2 top-2 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium capitalize text-text-secondary backdrop-blur-sm">
            {listing.status}
          </div>
        )}
        {isAuction && listing.status === "active" && (
          <div className="absolute left-2 top-2 rounded-full bg-accent/90 px-2.5 py-1 text-xs font-medium text-white">
            Auction
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-text-primary">
          {listing.nft.name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-text-secondary">
          {listing.nft.collectionName}
        </p>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-secondary">
              {isAuction ? (listing.highestBid ? "Current bid" : "Starting") : "Price"}
            </p>
            <p className="font-mono text-sm font-medium text-accent">
              {formatPrice(listing.highestBid ?? listing.price)}
            </p>
          </div>
          {listing.bidCount > 0 && (
            <p className="text-xs text-text-secondary">
              {listing.bidCount} bid{listing.bidCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
