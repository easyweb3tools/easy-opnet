import { NextResponse } from "next/server";
import { MOCK_STATS } from "@/lib/mock-data";

export function GET() {
  return NextResponse.json({
    success: true,
    data: MOCK_STATS,
  });
}
