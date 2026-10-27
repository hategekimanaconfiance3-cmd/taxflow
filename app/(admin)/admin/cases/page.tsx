import { requireRRASession } from "@/lib/auth-guard";
import { getRraCases, type RraCaseStatus } from "@/lib/actions/rra-case.action";
import { RraCaseManagement } from "@/components/admin/rra-case-management";

export const metadata = { title: "RRA Cases · TaxFlow" };

export default async function RraCasesPage() {
  await requireRRASession("compliance_officer", "audit_officer");
  const cases = await getRraCases();
  return <RraCaseManagement initialCases={cases.map((item) => ({ ...item, status: item.status as RraCaseStatus }))} />;
}
