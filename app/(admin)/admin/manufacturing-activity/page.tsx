import { ManufacturingActivityWorkspace } from "@/components/admin/manufacturing-activity-workspace";
import { getManufacturerActivity, searchManufacturersForActivity } from "@/lib/actions/manufacturing-activity.action";
import { requireRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";

export default async function ManufacturingActivityPage() {
  const { staff } = await requireRRAPermission("taxpayer.activity.read");
  const searchResult = await searchManufacturersForActivity({ search: "" });
  const manufacturers = searchResult.success ? searchResult.data : [];
  const initialResult = manufacturers[0]
    ? await getManufacturerActivity({ manufacturerId: manufacturers[0].id })
    : null;

  // Gap 1+4: only Super Admin and Tax Compliance Officer can suspend/manage accounts
  const canManageAccounts = staff.clearanceRoles.some((role) =>
    hasRRAPermission(role, "taxpayer.account.manage")
  );
  // Gap 1: only Super Admin, Tax Compliance Officer, and select roles can edit profile names
  const canEditProfiles = staff.clearanceRoles.some((role) =>
    hasRRAPermission(role, "taxpayer.profile.edit")
  );
  // Gap 2: Auditors and Investigators get transaction-level detail in the activity feed
  const canSeeTransactionDetail = staff.clearanceRoles.some((role) =>
    hasRRAPermission(role, "transaction.read")
  );

  return (
    <ManufacturingActivityWorkspace
      initialManufacturers={manufacturers}
      initialActivity={initialResult?.success ? initialResult.data : null}
      canManageAccounts={canManageAccounts}
      canEditProfiles={canEditProfiles}
      canSeeTransactionDetail={canSeeTransactionDetail}
    />
  );
}
