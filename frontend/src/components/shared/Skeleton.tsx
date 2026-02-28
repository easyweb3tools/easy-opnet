export function Skeleton({ className = "" }: { readonly className?: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-lg ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  readonly lines?: number;
  readonly className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { readonly className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-6 ${className}`}
    >
      <Skeleton className="mb-4 aspect-square w-full rounded-xl" />
      <Skeleton className="mb-2 h-5 w-2/3" />
      <Skeleton className="mb-4 h-4 w-1/3" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    </div>
  );
}
