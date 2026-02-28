const BTC_DECIMALS = 8;
const SATS_PER_BTC = 100_000_000;

export function formatBtc(satoshis: string): string {
  const sats = Number(satoshis);
  if (Number.isNaN(sats)) return "0 BTC";
  const btc = sats / SATS_PER_BTC;
  return `${btc.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: BTC_DECIMALS,
  })} BTC`;
}

export function formatPrice(satoshis: string): string {
  const sats = Number(satoshis);
  if (Number.isNaN(sats)) return "0 sats";
  if (sats >= SATS_PER_BTC) {
    return formatBtc(satoshis);
  }
  return `${sats.toLocaleString("en-US")} sats`;
}

export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export function formatPercentChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}
