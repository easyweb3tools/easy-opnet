import type { ActivityEvent } from "@/types";
import { timeAgo, formatPrice } from "@/lib/format";

const typeConfig: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  mint: { icon: "M", color: "text-success", label: "Minted" },
  list: { icon: "L", color: "text-accent", label: "Listed" },
  bid: { icon: "B", color: "text-warning", label: "Bid" },
  sale: { icon: "S", color: "text-success", label: "Sold" },
  cancel: { icon: "X", color: "text-error", label: "Cancelled" },
  transfer: { icon: "T", color: "text-text-secondary", label: "Transferred" },
};

export function AgentActivity({
  events,
  className = "",
}: {
  readonly events: readonly ActivityEvent[];
  readonly className?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-text-secondary">No activity yet.</p>
    );
  }

  return (
    <div className={`space-y-0 ${className}`}>
      {events.map((event, idx) => {
        const config = typeConfig[event.type] ?? typeConfig.transfer!;
        return (
          <div
            key={event.id}
            className="relative flex gap-4 py-3"
          >
            {/* Timeline line */}
            {idx < events.length - 1 && (
              <div className="absolute left-[15px] top-10 h-[calc(100%-16px)] w-px bg-border" />
            )}
            {/* Icon */}
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xs font-bold ${config.color}`}
            >
              {config.icon}
            </div>
            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-primary">
                <span className={`font-medium ${config.color}`}>
                  {config.label}
                </span>
                {event.nftName && (
                  <span className="text-text-secondary">
                    {" "}{event.nftName}
                  </span>
                )}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                {event.amount && (
                  <span className="font-mono">{formatPrice(event.amount)}</span>
                )}
                <span>{timeAgo(event.timestamp)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
