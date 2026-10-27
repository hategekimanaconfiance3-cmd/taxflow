import { NextResponse } from "next/server";
import { getSuperAdminPlatformHealth } from "@/lib/actions/super-admin-platform-health.action";

export async function GET() {
  try {
    return NextResponse.json(await getSuperAdminPlatformHealth(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Super Admin platform health endpoint failed", { errorName: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ error: "Platform health is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
