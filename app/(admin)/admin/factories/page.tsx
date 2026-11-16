import { FactoryReviewWorkspace } from "@/components/admin/factory-review-workspace";
import { getFactoriesForOfficerReview } from "@/lib/actions/factory.action";
import { requireRRAPermission } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";

export default async function FactoryOnboardingPage() {
  const { staff } = await requireRRAPermission("industrial.factory.read");
  const factories = await getFactoriesForOfficerReview();
  const canReview = staff.clearanceRoles.some((role) => hasRRAPermission(role, "industrial.factory.review"));

  return <FactoryReviewWorkspace initialFactories={factories} canReview={canReview} />;
}
