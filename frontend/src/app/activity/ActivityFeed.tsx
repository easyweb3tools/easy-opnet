"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchActivity } from "@/lib/api";
import { formatPrice, timeAgo } from "@/lib/format";
import { AgentBadge } from "@/components/agent/AgentBadge";
import { Skeleton } from "@/components/shared/Skeleton";
import { LiveDot } from "@/components/shared/LiveDot";
import { findAgent } from "@/lib/mock-data";
import type { ActivityFilterType } from "@/types";

const FILTER_TYPES: { value: ActivityFilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mint", label: "Mints" },
  { value: "list", label: "Listings" },
  { value: "bid", label: "Bids" },
  { value: "sale", label: "Sales" },
  { value: "cancel", label: "Cancels" },
  { value: "transfer", label: "Transfers" },
];

const typeColors: Record<string, string> = {
  mint: "text-success",
  list: "text-accent",
  bid: "text-warning",
  sale: "text-success",
  cancel: "text-error",
  transfer: "text-text-secondary",
};

export function ActivityFeed() {
  const [filter, setFilter] = useState<ActivityFilterType>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["activity", filter],
    queryFn: () => fetchActivity({ type: filter, limit: 30 }),
    refetchInterval: 30_000,
  });

  const events = data?.items ?? [];

  return (
    <div>
      {/* Filter pills */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <div className="mr-2 flex items-center gap-2">
          <LiveDot />
          <span className="text-sm text-text-secondary">Live</span>
        </div>
        {FILTER_TYPES.map((ft) => (
          <button
            key={ft.value}
            type="button"
            onClick={() => setFilter(ft.value)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              filter === ft.value
                ? "bg-accent text-white"
                : "border border-border bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            {ft.label}
          </button>
        ))}
      </div>

      {/* Event Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const agent = findAgent(event.agent);
            const color = typeColors[event.type] ?? "text-text-secondary";
            return (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-hover"
              >
                <div className="flex items-center gap-4">
                  {/* Type indicator */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-bold ${color}`}
                  >
                    {event.type.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {agent && (
                        <AgentBadge
                          name={agent.name}
                          address={agent.address}
                          size="sm"
                        />
                      )}
                      <span className={`text-sm font-medium capitalize ${color}`}>
                        {event.type}
                      </span>
                    </div>
                    {event.nftName && (
                      <p className="mt-0.5 text-sm text-text-secondary">
                        {event.nftName}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  {event.amount && (
                    <span className="font-mono text-sm font-medium text-accent">
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
          {events.length === 0 && (
            <p className="py-12 text-center text-sm text-text-secondary">
              No activity found for this filter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
