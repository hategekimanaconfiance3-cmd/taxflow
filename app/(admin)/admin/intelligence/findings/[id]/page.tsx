import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FindingReviewControls } from "@/components/admin/finding-review-controls";
import { ProductionHistoryFindingEvidence } from "@/components/admin/production-history-finding-evidence";
import { getFindingById } from "@/lib/actions/ai-finding.action";
import { requireAnyRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";

export default async function FindingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireAnyRRAPermission("ai.findings.read", "investigation.case.manage", "compliance.followup.manage");
  const { id } = await params;
  const finding = await getFindingById(id);
  if (!finding) notFound();

  const canReadFormula = staff.clearanceRoles.some((role) => role !== "super_admin" && hasRRAPermission(role, "production.formula.read"));
  const canReview = staff.clearanceRoles.some((role) => hasRRAPermission(role, "compliance.followup.manage") || hasRRAPermission(role, "investigation.case.manage"))
    && (finding.findingType !== "production_discrepancy" || canReadFormula);
  let evidence: Record<string, unknown> | null = null;
  if (finding.evidenceRefs) {
    try {
      const parsed: unknown = JSON.parse(finding.evidenceRefs);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) evidence = parsed as Record<string, unknown>;
    } catch {
      evidence = null;
    }
  }
  const productionBatchId = finding.findingType === "production_discrepancy" && typeof evidence?.batchId === "string" ? evidence.batchId : null;

  return <div className="mx-auto max-w-4xl space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">AI finding review</h1><p className="text-sm text-muted-foreground">Review the recorded signal and supporting TaxFlow evidence. The finding is advisory.</p></div>
      <Button asChild variant="outline"><Link href="/admin/intelligence/findings">All findings</Link></Button>
    </div>
    <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{finding.findingType.replaceAll("_", " ")}</CardTitle><div className="flex gap-2"><Badge variant="outline">{finding.severity}</Badge><Badge variant="outline">{finding.reviewStatus.replaceAll("_", " ")}</Badge></div></div></CardHeader>
      <CardContent className="space-y-4">
        <p>{finding.explanation}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Business</dt><dd>{finding.businessName ?? "Not recorded"}</dd></div>
          <div><dt className="text-muted-foreground">Created</dt><dd>{finding.createdAt.toLocaleString()}</dd></div>
          <div><dt className="text-muted-foreground">Observed</dt><dd>{finding.observedValue?.toLocaleString() ?? "Not stored"}</dd></div>
          <div><dt className="text-muted-foreground">Expected</dt><dd>{finding.expectedValue?.toLocaleString() ?? "Not stored"}</dd></div>
        </dl>
        {evidence && <div><h2 className="mb-1 text-sm font-semibold">Evidence references</h2><pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(evidence, null, 2)}</pre></div>}
        {finding.resolutionNotes && <div><h2 className="text-sm font-semibold">Reviewer note</h2><p className="whitespace-pre-wrap text-sm">{finding.resolutionNotes}</p></div>}
        <FindingReviewControls findingId={finding.id} status={finding.reviewStatus} canReview={canReview} />
      </CardContent>
    </Card>
    {productionBatchId && canReadFormula && <ProductionHistoryFindingEvidence batchId={productionBatchId} />}
    {productionBatchId && !canReadFormula && <p className="rounded-md border p-3 text-sm text-muted-foreground">Detailed production measurements require the separate production formula permission.</p>}
  </div>;
}
