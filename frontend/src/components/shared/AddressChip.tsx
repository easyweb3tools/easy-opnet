"use client";

import { useState, useCallback } from "react";
import { truncateAddress } from "@/lib/format";

export function AddressChip({
  address,
  chars = 6,
  className = "",
}: {
  readonly address: string;
  readonly chars?: number;
  readonly className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary ${className}`}
      title={`Copy: ${address}`}
    >
      <span>{truncateAddress(address, chars)}</span>
      <span className="text-[10px]">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}
