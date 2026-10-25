import { requireAnyRRAOperationalPermission } from "@/lib/auth-guard";
import { hasOperationalRRAPermission } from "@/lib/rra-rbac";
import { getRraCases, type RraCaseStatus } from "@/lib/actions/rra-case.action";
import { RraCaseManagement } from "@/components/admin/rra-case-management";

export const metadata = { title: "RRA Cases · TaxFlow" };

export default async function RraCasesPage() {
  const { staff } = await requireAnyRRAOperationalPermission("compliance.followup.manage", "investigation.case.manage");
  const cases = await getRraCases();
  const canRequestTaxpayerInformation = hasOperationalRRAPermission(staff.clearanceRoles, "compliance.followup.manage");
  return <RraCaseManagement initialCases={cases.map((item) => ({ ...item, status: item.status as RraCaseStatus }))} canRequestTaxpayerInformation={canRequestTaxpayerInformation} />;
}
