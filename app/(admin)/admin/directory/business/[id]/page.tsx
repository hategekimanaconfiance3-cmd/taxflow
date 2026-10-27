import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { requireRRASession } from "@/lib/auth-guard";
import db from "@/db/drizzle";
import { user } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SuperAdminBusinessDirectoryRecord({ params }: { params: Promise<{ id: string }> }) {
  await requireRRASession("super_admin");
  const { id } = await params;
  if (id.trim().length < 1 || id.length > 128) notFound();

  const [business] = await db.select({
    id: user.id,
    name: user.businessName,
    tin: user.tinNumber,
    role: user.role,
    active: user.isActive,
    registeredAt: user.createdAt,
  }).from(user)
    .where(and(eq(user.id, id), inArray(user.role, ["manufacturer", "wholesaler", "retailer"])))
    .limit(1);

  if (!business) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/dashboard/overview">Back to Command Center</Link></Button>
      <Card>
        <CardHeader>
          <CardDescription>Super Admin business directory · basic registration details</CardDescription>
          <CardTitle>{business.name ?? "Unnamed business"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">TIN</p><p className="font-mono">{business.tin ?? "Not recorded"}</p></div>
          <div><p className="text-xs text-muted-foreground">Business type</p><p className="capitalize">{business.role}</p></div>
          <div><p className="text-xs text-muted-foreground">Account status</p><p>{business.active ? "Active" : "Inactive"}</p></div>
          <div><p className="text-xs text-muted-foreground">Registered</p><p>{business.registeredAt ? business.registeredAt.toLocaleDateString("en-RW", { timeZone: "Africa/Kigali" }) : "Not recorded"}</p></div>
          <p className="text-sm text-muted-foreground sm:col-span-2">Taxpayer intelligence details require the separate taxpayer intelligence permission and are not included in this directory view.</p>
        </CardContent>
      </Card>
    </main>
  );
}