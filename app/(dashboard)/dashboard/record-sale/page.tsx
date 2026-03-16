import { requireTraderSession } from "@/lib/auth-guard";
import { getInventory } from "@/lib/actions/stock.action";
import { getSystemConfig } from "@/lib/actions/system-config.action";
import { RecordSaleForm } from "@/components/dashboard/record-sale/record-sale-form";

export default async function RecordSalePage() {
    await requireTraderSession(["retailer"]);
    const [inventory, config] = await Promise.all([
        getInventory(),
        getSystemConfig(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Record Sale
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Record a sale to a final consumer. Stock is deducted
                    immediately.
                </p>
            </div>

            <RecordSaleForm inventory={inventory} vatRate={config.vatRate} />
        </div>
    );
}
