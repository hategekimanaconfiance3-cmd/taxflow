import { requireAnyRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import { getCorrectionAssignmentQueue, getCorrectionOfficerWorkspace, listActiveCorrectionOfficers } from "@/lib/actions/taxpayer-correction.action";
import { TaxpayerCorrectionQueue } from "@/components/admin/taxpayer-correction-queue";
import { TaxpayerCorrectionAssignment } from "@/components/admin/taxpayer-correction-assignment";

export const metadata = { title: "Taxpayer Corrections · TaxFlow" };

export default async function TaxpayerCorrectionsPage() {
  const { staff } = await requireAnyRRAPermission("taxpayer.correction.read_assigned", "taxpayer.correction.assign");
  const canReadAssigned = staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.correction.read_assigned"));
  const canAssign = staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.correction.assign"));
  const [workspace, assignmentQueue, officers] = await Promise.all([
    canReadAssigned ? getCorrectionOfficerWorkspace() : Promise.resolve({ cases: [], counts: { assigned: 0, new: 0, awaitingEvidence: 0, recommended: 0, overdue: 0 } }),
    canAssign ? getCorrectionAssignmentQueue() : Promise.resolve([]),
    canAssign ? listActiveCorrectionOfficers() : Promise.resolve([]),
  ]);

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Taxpayer Correction Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review assigned taxpayer requests, examine evidence, and submit recommendations. Recommendations do not change taxpayer records.</p>
      </header>
      {canReadAssigned ? (
        <TaxpayerCorrectionQueue cases={workspace.cases} counts={workspace.counts} />
      ) : null}
      {canAssign ? (
        <TaxpayerCorrectionAssignment requests={assignmentQueue} officers={officers} />
      ) : null}
      {!canReadAssigned && !canAssign ? <p className="rounded border p-5">No correction workspace permission is assigned.</p> : null}
    </main>
  );
}
