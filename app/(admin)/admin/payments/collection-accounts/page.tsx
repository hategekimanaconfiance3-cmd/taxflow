import { requireRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import {
  getCollectionAccounts,
  getCollectionAccountSummary,
} from "@/lib/actions/rra-collection-account.action";
import { RraCollectionAccountsWorkspace } from "@/components/admin/rra-collection-accounts-workspace";

export default async function CollectionAccountsPage() {
  const { staff } = await requireRRAPermission("payments.read");

  const canManage = staff.clearanceRoles.some((r) =>
    hasRRAPermission(r, "payments.accounts.manage")
  );
  const canReview = staff.clearanceRoles.some((r) =>
    hasRRAPermission(r, "payments.accounts.review")
  );

  const [accountsResult, summaryResult] = await Promise.all([
    getCollectionAccounts("all"),
    getCollectionAccountSummary(),
  ]);

  const accounts = accountsResult.success ? accountsResult.data : [];
  const summary = summaryResult.success
    ? summaryResult.data
    : { total: 0, verified: 0, pending: 0, active: 0, inactive: 0, totalCollectedRwf: 0, byType: { bank_account: 0, mobile_money: 0 } };

  return (
    <RraCollectionAccountsWorkspace
      initialAccounts={accounts}
      summary={summary}
      canManage={canManage}
      canReview={canReview}
    />
  );
}
