import { requireTraderSession } from "@/lib/auth-guard";
import { getInventory } from "@/lib/actions/stock.action";
import { getSystemConfig } from "@/lib/actions/system-config.action";
import { SellForm } from "@/components/dashboard/sell-form/sell-form";

export default async function SellPage() {
    const session = await requireTraderSession(["manufacturer", "wholesaler"]);
    const [inventory, config] = await Promise.all([
        getInventory(),
        getSystemConfig(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Sell to Buyer
                </h1>
                <p className="text-muted-foreground">
                    Verify a buyer by TIN, select products, and create a sale.
                </p>
            </div>

            <SellForm inventory={inventory} vatRate={config.vatRate} />
        </div>
    );
}
