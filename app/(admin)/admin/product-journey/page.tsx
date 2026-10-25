import { requireRRASession } from "@/lib/auth-guard";
import { ProductJourneyExplorer } from "@/components/admin/product-journey-explorer";

export default async function ProductJourneyPage({ searchParams }: { searchParams: Promise<{ query?: string }> }) {
    await requireRRASession("audit_officer", "stock_officer", "audit_investigation_officer", "product_traceability_officer");
    const params = await searchParams;
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Product Journey</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Follow recorded product transactions and inspect their supporting records.
                </p>
            </div>
            <ProductJourneyExplorer initialQuery={params.query ?? ""} />
        </div>
    );
}
