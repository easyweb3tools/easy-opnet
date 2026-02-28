import { formatPercentChange } from "@/lib/format";

export function StatCard({
  label,
  value,
  change,
  className = "",
}: {
  readonly label: string;
  readonly value: string;
  readonly change?: number;
  readonly className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-6 ${className}`}
    >
      <p className="mb-1 text-sm text-text-secondary">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-text-primary">
        {value}
      </p>
      {change !== undefined && (
        <p
          className={`mt-1 text-sm font-medium ${
            change >= 0 ? "text-success" : "text-error"
          }`}
        >
          {formatPercentChange(change)}
        </p>
      )}
    </div>
  );
}
