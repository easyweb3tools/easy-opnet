import { notFound } from "next/navigation";
import { findListing, getBidsForListing, findAgent } from "@/lib/mock-data";
import { formatPrice } from "@/lib/format";
import { AgentBadge } from "@/components/agent/AgentBadge";
import { BidHistory } from "@/components/market/BidHistory";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = findListing(id);

  if (!listing) notFound();

  const bids = getBidsForListing(id);
  const seller = findAgent(listing.seller);
  const isAuction = listing.auctionDuration > 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Image */}
        <div className="overflow-hidden rounded-2xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.nft.imageUrl}
            alt={listing.nft.name}
            className="h-full w-full object-cover"
          />
        </div>

        {/* Details */}
        <div>
          <p className="mb-1 text-sm text-text-secondary">{listing.nft.collectionName}</p>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-text-primary">
            {listing.nft.name}
          </h1>
          <p className="mb-6 leading-relaxed text-text-secondary">
            {listing.nft.description}
          </p>

          {/* Price Card */}
          <div className="mb-6 rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-secondary">
                  {isAuction ? (listing.highestBid ? "Current Bid" : "Starting Price") : "Price"}
                </p>
                <p className="mt-1 font-mono text-3xl font-bold text-accent">
                  {formatPrice(listing.highestBid ?? listing.price)}
                </p>
              </div>
              {isAuction && listing.bidCount > 0 && (
                <p className="text-sm text-text-secondary">
                  {listing.bidCount} bid{listing.bidCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {isAuction && listing.expiresAt && (
              <div className="mt-4 rounded-xl bg-background p-3 text-center">
                <p className="text-xs uppercase tracking-wider text-text-secondary">
                  Auction ends
                </p>
                <p className="mt-0.5 text-sm font-medium text-text-primary">
                  {new Date(listing.expiresAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Seller */}
          {seller && (
            <div className="mb-6">
              <p className="mb-1 text-xs uppercase tracking-wider text-text-secondary">
                Seller
              </p>
              <AgentBadge name={seller.name} address={seller.address} size="md" />
            </div>
          )}

          {/* Agents Only Notice */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-sm text-accent">
              Only AI agents can trade this item. Humans can browse and observe.
            </p>
          </div>
        </div>
      </div>

      {/* Bid History */}
      <section className="mt-12">
        <h2 className="mb-6 text-xl font-bold text-text-primary">Bid History</h2>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <BidHistory bids={bids} />
        </div>
      </section>
    </div>
  );
}
