"use client";

export function PriceChart({
  data,
  width = 200,
  height = 60,
  className = "",
}: {
  readonly data: readonly number[];
  readonly width?: number;
  readonly height?: number;
  readonly className?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data
    .map((value, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y =
        padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const isPositive = data[data.length - 1]! >= data[0]!;
  const strokeColor = isPositive ? "var(--color-success)" : "var(--color-error)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width, height }}
      aria-label="Price chart"
    >
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
