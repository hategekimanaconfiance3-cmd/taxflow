import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import db from "@/db/drizzle";
import { importDeclaration, rraStaff } from "@/db/schema";
import { getImportUploadDirectory, isImportFilenameForDeclaration } from "@/lib/import-files";

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
      .select({ clearanceLevel: rraStaff.clearanceLevel, isActive: rraStaff.isActive })
      .from(rraStaff)
      .where(eq(rraStaff.userId, session.user.id))
      .limit(1);
    hasAccess = Boolean(staff?.isActive && ["super_admin", "compliance_officer", "audit_officer"].includes(staff.clearanceLevel));
  }
  if (!hasAccess) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  try {
    const file = await readFile(join(getImportUploadDirectory(), filename));
    return new NextResponse(new Uint8Array(file), {
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
