import { requireAnyRRAOperationalPermission } from "@/lib/auth-guard";
import { hasOperationalRRAPermission } from "@/lib/rra-rbac";
import { getRraCases, type RraCaseStatus } from "@/lib/actions/rra-case.action";
import { RraCaseManagement } from "@/components/admin/rra-case-management";

export const metadata = { title: "RRA Cases · TaxFlow" };

export default async function RraCasesPage({ searchParams }: { searchParams: Promise<{ tin?: string; caseId?: string }> }) {
  const { staff } = await requireAnyRRAOperationalPermission("compliance.followup.manage", "investigation.case.manage");
  const params = await searchParams;
  const initialTin = params.tin?.trim() ?? "";
  const cases = await getRraCases(initialTin ? { query: initialTin } : {});
  const canRequestTaxpayerInformation = hasOperationalRRAPermission(staff.clearanceRoles, "compliance.followup.manage");
  return <RraCaseManagement initialCases={cases.map((item) => ({ ...item, status: item.status as RraCaseStatus }))} canRequestTaxpayerInformation={canRequestTaxpayerInformation} initialSearch={initialTin} initialTraderTin={initialTin} focusCaseId={params.caseId} />;
}
