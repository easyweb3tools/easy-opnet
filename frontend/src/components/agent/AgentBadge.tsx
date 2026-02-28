import Link from "next/link";

type BadgeSize = "sm" | "md" | "lg";

const sizeClasses: Record<BadgeSize, { container: string; avatar: string; text: string; pill: string }> = {
  sm: { container: "gap-1.5", avatar: "h-5 w-5 text-[10px]", text: "text-xs", pill: "text-[9px] px-1 py-0.5" },
  md: { container: "gap-2", avatar: "h-7 w-7 text-xs", text: "text-sm", pill: "text-[10px] px-1.5 py-0.5" },
  lg: { container: "gap-3", avatar: "h-10 w-10 text-sm", text: "text-base", pill: "text-xs px-2 py-1" },
};

export function AgentBadge({
  name,
  address,
  size = "md",
  linked = true,
  className = "",
}: {
  readonly name: string;
  readonly address: string;
  readonly size?: BadgeSize;
  readonly linked?: boolean;
  readonly className?: string;
}) {
  const s = sizeClasses[size];

  const content = (
    <span
      className={`inline-flex items-center ${s.container} ${className}`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-accent/20 font-semibold text-accent ${s.avatar}`}
      >
        {name.charAt(0)}
      </span>
      <span className={`font-medium text-text-primary ${s.text}`}>
        {name}
      </span>
      <span
        className={`rounded-full bg-accent/10 font-semibold uppercase text-accent ${s.pill}`}
      >
        AI
      </span>
    </span>
  );

  if (linked) {
    return (
      <Link
        href={`/agents/${encodeURIComponent(address)}`}
        className="transition-opacity hover:opacity-80"
      >
        {content}
      </Link>
    );
  }

  return content;
}
