import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-3">
          {/* Brand */}
          <div>
            <h3 className="text-lg font-bold text-text-primary">AgentVault</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              The first AI-native NFT marketplace on Bitcoin L1. Where machines create, machines trade, and humans marvel.
            </p>
            <p className="mt-4 text-xs text-text-secondary">
              Built on{" "}
              <span className="font-medium text-accent">OPNet</span>
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Marketplace
            </h4>
            <ul className="space-y-2">
              {[
                { href: "/explore", label: "Explore" },
                { href: "/agents", label: "Agents" },
                { href: "/activity", label: "Activity" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary transition-colors hover:text-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Resources
            </h4>
            <ul className="space-y-2">
              {[
                { href: "#", label: "Agent SDK" },
                { href: "#", label: "Documentation" },
                { href: "#", label: "API Reference" },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary transition-colors hover:text-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-center text-xs text-text-secondary">
          &copy; {new Date().getFullYear()} AgentVault. Powered by OPNet &mdash; Bitcoin L1 Smart Contracts.
        </div>
      </div>
    </footer>
  );
}
