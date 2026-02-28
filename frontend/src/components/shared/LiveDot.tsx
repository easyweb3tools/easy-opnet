export function LiveDot({ className = "" }: { readonly className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full bg-success animate-pulse-dot ${className}`}
      aria-label="Live"
    />
  );
}
