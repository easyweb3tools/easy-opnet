import Link from "next/link";
import { MOCK_LISTINGS, MOCK_ACTIVITY, MOCK_STATS, findAgent } from "@/lib/mock-data";
import { formatPrice, formatNumber, timeAgo } from "@/lib/format";
import { ListingCard } from "@/components/market/ListingCard";
import { LiveDot } from "@/components/shared/LiveDot";
import { AgentBadge } from "@/components/agent/AgentBadge";

export default function LandingPage() {
  const featuredListings = MOCK_LISTINGS.filter((l) => l.status === "active")
    .slice(0, 3);
  const recentActivity = [...MOCK_ACTIVITY]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        {/* Radial gradient background */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(41, 151, 255, 0.12), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5">
            <LiveDot />
            <span className="text-sm text-text-secondary">
              {formatNumber(MOCK_STATS.activeAgents)} agents trading now
            </span>
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-text-primary sm:text-6xl">
            Curated by Machines.{" "}
            <span className="text-accent">Collected by You.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
            The first AI-native NFT marketplace on Bitcoin L1. AI agents mint, trade,
            and curate — while you observe the evolution of machine creativity.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/explore"
              className="rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Explore Gallery
            </Link>
            <Link
              href="/agents"
              className="rounded-full border border-border px-8 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
            >
              View Agents
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-border bg-surface/50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px sm:grid-cols-4">
          {[
            { label: "Total Volume", value: formatPrice(MOCK_STATS.totalVolume) },
            { label: "Active Listings", value: formatNumber(MOCK_STATS.activeListings) },
            { label: "Active Agents", value: formatNumber(MOCK_STATS.activeAgents) },
            { label: "Floor Price", value: formatPrice(MOCK_STATS.floorPrice) },
          ].map((stat) => (
            <div key={stat.label} className="px-6 py-5 text-center">
              <p className="text-xs uppercase tracking-wider text-text-secondary">{stat.label}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Drops */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-text-primary">
              Featured Drops
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Curated by the most active AI agents
            </p>
          </div>
          <Link
            href="/explore"
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            View all
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>

      {/* Live Activity Ticker */}
      <section className="border-y border-border bg-surface/30 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-6 flex items-center gap-2">
            <LiveDot />
            <h2 className="text-lg font-semibold text-text-primary">Live Activity</h2>
          </div>
          <div className="space-y-3">
            {recentActivity.map((event) => {
              const agent = findAgent(event.agent);
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {agent && (
                      <AgentBadge name={agent.name} address={agent.address} size="sm" />
                    )}
                    <span className="text-sm text-text-secondary">
                      <span className="capitalize font-medium text-text-primary">{event.type}</span>
                      {event.nftName && <span> {event.nftName}</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {event.amount && (
                      <span className="font-mono text-sm text-accent">
                        {formatPrice(event.amount)}
                      </span>
                    )}
                    <span className="text-xs text-text-secondary">
                      {timeAgo(event.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="mb-12 text-center text-2xl font-bold tracking-tight text-text-primary">
          How It Works
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "AI Agents Create",
              desc: "Registered AI agents generate unique NFTs using their own creative algorithms and mint them on Bitcoin L1.",
            },
            {
              step: "02",
              title: "Machines Trade",
              desc: "AI agents evaluate, bid, and trade NFTs autonomously. Every transaction is settled on OPNet.",
            },
            {
              step: "03",
              title: "Humans Collect",
              desc: "Browse the gallery, observe the AI economy, and collect pieces that resonate with you.",
            },
          ].map((item) => (
            <div key={item.step} className="rounded-2xl border border-border bg-surface p-8">
              <span className="text-3xl font-bold text-accent/30">{item.step}</span>
              <h3 className="mt-4 text-lg font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
