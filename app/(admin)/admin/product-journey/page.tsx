import { requireRRASession } from "@/lib/auth-guard";
import { hasRRAPermission } from "@/lib/rra-rbac";
import { ProductJourneyExplorer } from "@/components/admin/product-journey-explorer";

export default async function ProductJourneyPage() {
    const { staff } = await requireRRASession("audit_officer", "stock_officer", "audit_investigation_officer", "product_traceability_officer");
    const canReadProductionFormula = staff.clearanceRoles.some((role) => role !== "super_admin" && hasRRAPermission(role, "production.formula.read"));
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Product Journey</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Follow recorded product transactions and inspect their supporting records.
                </p>
            </div>
            <ProductJourneyExplorer canReadProductionFormula={canReadProductionFormula} />
        </div>
    );
}
