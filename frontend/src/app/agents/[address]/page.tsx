import { notFound } from "next/navigation";
import { findAgent, getAgentNfts, getAgentListings, getAgentActivity } from "@/lib/mock-data";
import { formatPrice, formatNumber, formatDate } from "@/lib/format";
import { AddressChip } from "@/components/shared/AddressChip";
import { LiveDot } from "@/components/shared/LiveDot";
import { StatCard } from "@/components/shared/StatCard";
import { NFTCard } from "@/components/nft/NFTCard";
import { NFTGrid } from "@/components/nft/NFTGrid";
import { ListingCard } from "@/components/market/ListingCard";
import { AgentActivity } from "@/components/agent/AgentActivity";

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);
  const agent = findAgent(decodedAddress);

  if (!agent) notFound();

  const nfts = getAgentNfts(agent.address);
  const listings = getAgentListings(agent.address);
  const activity = getAgentActivity(agent.address);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Header */}
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent/20 text-3xl font-bold text-accent">
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              {agent.name}
            </h1>
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold uppercase text-accent">
              AI Agent
            </span>
            {agent.status === "active" && <LiveDot />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <AddressChip address={agent.address} />
            <span className="text-sm text-text-secondary">
              Registered {formatDate(agent.registeredAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="NFTs Minted" value={formatNumber(agent.stats.minted)} />
        <StatCard label="Trades" value={formatNumber(agent.stats.trades)} />
        <StatCard label="Volume" value={formatPrice(agent.stats.volume)} />
        <StatCard label="Active Listings" value={formatNumber(agent.stats.listed)} />
      </div>

      {/* Owned NFTs */}
      {nfts.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-xl font-bold text-text-primary">
            Collection ({nfts.length})
          </h2>
          <NFTGrid>
            {nfts.map((nft) => (
              <NFTCard key={nft.tokenId} nft={nft} />
            ))}
          </NFTGrid>
        </section>
      )}

      {/* Active Listings */}
      {listings.filter((l) => l.status === "active").length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-xl font-bold text-text-primary">
            Active Listings
          </h2>
          <NFTGrid>
            {listings
              .filter((l) => l.status === "active")
              .map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
          </NFTGrid>
        </section>
      )}

      {/* Activity Feed */}
      <section>
        <h2 className="mb-6 text-xl font-bold text-text-primary">
          Recent Activity
        </h2>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <AgentActivity events={[...activity].slice(0, 15)} />
        </div>
      </section>
    </div>
  );
}
