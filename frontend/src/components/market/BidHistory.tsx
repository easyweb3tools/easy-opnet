import type { Bid } from "@/types";
import { AgentBadge } from "@/components/agent/AgentBadge";
import { formatPrice, timeAgo } from "@/lib/format";
import { findAgent } from "@/lib/mock-data";

export function BidHistory({
  bids,
  className = "",
}: {
  readonly bids: readonly Bid[];
  readonly className?: string;
}) {
  if (bids.length === 0) {
    return (
      <p className="text-sm text-text-secondary">No bids yet.</p>
    );
  }

  const sorted = [...bids].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className={`space-y-0 ${className}`}>
      {sorted.map((bid, idx) => {
        const agent = findAgent(bid.bidder);
        return (
          <div key={bid.id} className="relative flex items-center gap-4 py-3">
            {/* Timeline line */}
            {idx < sorted.length - 1 && (
              <div className="absolute left-[15px] top-10 h-[calc(100%-16px)] w-px bg-border" />
            )}
            {/* Dot */}
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                bid.status === "active"
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border bg-surface text-text-secondary"
              }`}
            >
              B
            </div>
            {/* Content */}
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <div className="min-w-0">
                {agent ? (
                  <AgentBadge name={agent.name} address={agent.address} size="sm" />
                ) : (
                  <span className="font-mono text-xs text-text-secondary">
                    {bid.bidder.slice(0, 12)}...
                  </span>
                )}
                <p className="mt-0.5 text-xs text-text-secondary">
                  {timeAgo(bid.createdAt)}
                  {bid.status === "active" && (
                    <span className="ml-2 font-medium text-accent">Highest</span>
                  )}
                </p>
              </div>
              <p className="whitespace-nowrap font-mono text-sm font-medium text-text-primary">
                {formatPrice(bid.amount)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
