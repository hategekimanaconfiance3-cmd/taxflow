import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import db from "@/db/drizzle";
import { importDeclaration, rraStaff, rraStaffRole } from "@/db/schema";
import { importBlobPathname, isImportFilenameForDeclaration } from "@/lib/import-files";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ filename: string }> },
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { filename } = await context.params;
  const [declaration] = await db
    .select({ id: importDeclaration.id, businessId: importDeclaration.businessId })
    .from(importDeclaration)
    .where(eq(importDeclaration.supportingDoc, `/api/import-invoice/${filename}`))
    .limit(1);
  if (!declaration || !isImportFilenameForDeclaration(filename, declaration.id)) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  let hasAccess = declaration.businessId === session.user.id;
  if (!hasAccess) {
    const [staff] = await db
      .select({ id: rraStaff.id })
      .from(rraStaffRole)
      .innerJoin(rraStaff, eq(rraStaffRole.staffRecordId, rraStaff.id))
      .where(and(eq(rraStaff.userId, session.user.id), eq(rraStaff.isActive, true), inArray(rraStaffRole.role, ["super_admin", "compliance_officer", "audit_officer", "stock_officer"])))
      .limit(1);
    hasAccess = Boolean(staff);
  }
  if (!hasAccess) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  try {
    if (!isImportFilenameForDeclaration(filename, declaration.id)) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const file = await get(importBlobPathname(filename), { access: "private" });
    if (!file || file.statusCode !== 200 || !file.stream || file.blob.contentType !== "application/pdf") {
      return NextResponse.json({ error: "Invoice file is unavailable" }, { status: 404 });
    }
    return new NextResponse(file.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="import-invoice.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Invoice file is unavailable" }, { status: 404 });
  }
}
