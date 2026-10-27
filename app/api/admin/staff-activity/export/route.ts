import { NextResponse } from "next/server";
import { requireRRASession } from "@/lib/auth-guard";
import { getStaffActivity, staffActivityCsv } from "@/lib/admin-staff-activity";

export async function GET(request: Request) {
  await requireRRASession("super_admin");
  const url = new URL(request.url);
  try {
    const activity = await getStaffActivity({
      period: url.searchParams.get("period") ?? "7d",
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      staffRecordId: url.searchParams.get("staffRecordId") ?? undefined,
    });
    return new NextResponse(staffActivityCsv(activity.events), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="taxflow-staff-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Super Admin staff activity export failed", { errorName: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ error: "Staff activity export is unavailable. Check your filters and retry." }, { status: 400 });
  }
}
