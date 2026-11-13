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

  return (
    <ManufacturingActivityWorkspace
      initialManufacturers={manufacturers}
      initialActivity={initialResult?.success ? initialResult.data : null}
      canManageAccounts={staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.account.manage"))}
      canEditProfiles={staff.clearanceRoles.some((role) => hasRRAPermission(role, "taxpayer.profile.edit"))}
    />
  );
}
