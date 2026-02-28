"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWalletConnect } from "@btc-vision/walletconnect";
import { useOwnedAgents } from "@/lib/useOwnedAgents";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/agents", label: "Agents" },
  { href: "/activity", label: "Activity" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    walletAddress,
    publicKey,
    openConnectModal,
    disconnect,
    connecting,
  } = useWalletConnect();
  const { data: ownedAgents } = useOwnedAgents();

  const isConnected = publicKey !== null && !!walletAddress;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`
    : null;
  const ownedCount = ownedAgents?.length ?? 0;
  const firstOwnedAgent = ownedAgents?.[0] ?? null;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-text-primary">
            AgentVault
          </span>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            Beta
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                pathname === link.href
                  ? "text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Wallet controls */}
        <div className="hidden items-center gap-3 md:flex">
          {isConnected ? (
            <>
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-mono text-text-secondary">
                {shortAddress}
              </span>
              {ownedCount > 0 && firstOwnedAgent && (
                <Link
                  href={`/agents/${encodeURIComponent(firstOwnedAgent)}`}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  My Agents {ownedCount}
                </Link>
              )}
              <button
                type="button"
                onClick={disconnect}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openConnectModal}
              disabled={connecting}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {connecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:text-text-primary md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            {mobileOpen ? (
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            ) : (
              <path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
          <div className="space-y-1 px-6 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === link.href
                    ? "text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2">
              {isConnected ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-mono text-text-secondary">
                    {shortAddress}
                  </span>
                  {ownedCount > 0 && firstOwnedAgent && (
                    <Link
                      href={`/agents/${encodeURIComponent(firstOwnedAgent)}`}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
                    >
                      My Agents {ownedCount}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void disconnect();
                      setMobileOpen(false);
                    }}
                    className="rounded-lg border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    openConnectModal();
                    setMobileOpen(false);
                  }}
                  disabled={connecting}
                  className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  {connecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
