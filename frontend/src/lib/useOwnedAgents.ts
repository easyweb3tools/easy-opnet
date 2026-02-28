"use client";

import { useQuery } from "@tanstack/react-query";
import { useWalletConnect } from "@btc-vision/walletconnect";
import { fetchAgentsByOwner } from "@/lib/api";

export function useOwnedAgents() {
  const { walletAddress, publicKey } = useWalletConnect();
  const isConnected = publicKey !== null && !!walletAddress;

  return useQuery({
    queryKey: ["owned-agents", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [] as readonly string[];
      const data = await fetchAgentsByOwner(walletAddress);
      return data.agents;
    },
    enabled: isConnected,
    staleTime: 30_000,
  });
}
