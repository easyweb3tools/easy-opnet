"use client";

import { useState } from "react";
import { MOCK_AGENTS } from "@/lib/mock-data";
import { formatPrice, formatNumber } from "@/lib/format";
import { AgentBadge } from "@/components/agent/AgentBadge";
import { LiveDot } from "@/components/shared/LiveDot";

type SortField = "minted" | "trades" | "volume" | "name";

export function AgentLeaderboard() {
  const [sortField, setSortField] = useState<SortField>("volume");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...MOCK_AGENTS].sort((a, b) => {
    const dir = sortAsc ? 1 : -1;
    switch (sortField) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "minted":
        return (a.stats.minted - b.stats.minted) * dir;
      case "trades":
        return (a.stats.trades - b.stats.trades) * dir;
      case "volume":
        return (Number(a.stats.volume) - Number(b.stats.volume)) * dir;
      default:
        return 0;
    }
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  const arrow = (field: SortField) =>
    sortField === field ? (sortAsc ? " \u2191" : " \u2193") : "";

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wider text-text-secondary">
            <th className="px-6 py-4">Rank</th>
            <th
              className="cursor-pointer px-6 py-4 hover:text-text-primary"
              onClick={() => handleSort("name")}
            >
              Agent{arrow("name")}
            </th>
            <th className="px-6 py-4">Status</th>
            <th
              className="cursor-pointer px-6 py-4 text-right hover:text-text-primary"
              onClick={() => handleSort("minted")}
            >
              Minted{arrow("minted")}
            </th>
            <th
              className="cursor-pointer px-6 py-4 text-right hover:text-text-primary"
              onClick={() => handleSort("trades")}
            >
              Trades{arrow("trades")}
            </th>
            <th
              className="cursor-pointer px-6 py-4 text-right hover:text-text-primary"
              onClick={() => handleSort("volume")}
            >
              Volume{arrow("volume")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((agent, idx) => (
            <tr
              key={agent.address}
              className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
            >
              <td className="px-6 py-4 text-sm text-text-secondary">
                #{idx + 1}
              </td>
              <td className="px-6 py-4">
                <AgentBadge name={agent.name} address={agent.address} size="md" />
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center gap-1.5">
                  {agent.status === "active" ? (
                    <>
                      <LiveDot />
                      <span className="text-sm text-success">Active</span>
                    </>
                  ) : (
                    <span className="text-sm text-text-secondary">Inactive</span>
                  )}
                </span>
              </td>
              <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                {formatNumber(agent.stats.minted)}
              </td>
              <td className="px-6 py-4 text-right font-mono text-sm text-text-primary">
                {formatNumber(agent.stats.trades)}
              </td>
              <td className="px-6 py-4 text-right font-mono text-sm text-accent">
                {formatPrice(agent.stats.volume)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
