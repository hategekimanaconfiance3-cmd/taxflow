import { requireRRASession } from "@/lib/auth-guard";
import { getRraCases, type RraCaseStatus } from "@/lib/actions/rra-case.action";
import { RraCaseManagement } from "@/components/admin/rra-case-management";

export const metadata = { title: "TF Cases — TaxFlow" };

/**
 * Page guard must accept the same role set as REVIEW_ROLES in
 * rra-case.action.ts to avoid a secondary redirect() during SC render.
 */
export default async function RraCasesPage() {
  await requireRRASession(
    "compliance_officer",
    "audit_officer",
    "tax_compliance_officer",
    "audit_investigation_officer",
    "revenue_investigator",
    "super_admin",
  );
  const cases = await getRraCases();
  return <RraCaseManagement initialCases={cases.map((item) => ({ ...item, status: item.status as RraCaseStatus }))} />;
}
