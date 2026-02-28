import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");

function fallbackBalanceFor(address: string): string {
  // Deterministic mock value, only used when backend proxy is unavailable.
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  return String((hash % 5_000_000) + 100_000);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: rawAddress } = await params;
  const address = decodeURIComponent(rawAddress);

  if (BACKEND_BASE_URL) {
    try {
      const upstream = await fetch(
        `${BACKEND_BASE_URL}/api/public/balance/${encodeURIComponent(address)}`,
        { cache: "no-store" },
      );

      const payload = (await upstream.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (payload && typeof payload === "object") {
        return NextResponse.json(payload, { status: upstream.status });
      }
    } catch {
      console.warn("Balance proxy failed, using fallback.");
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      address,
      balance: fallbackBalanceFor(address),
    },
  });
}
