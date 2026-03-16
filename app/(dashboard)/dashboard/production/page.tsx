import { requireTraderSession } from "@/lib/auth-guard";
import { getProducts, getInventory } from "@/lib/actions/stock.action";
import { getSystemConfig } from "@/lib/actions/system-config.action";
import { ProductionForm } from "@/components/dashboard/production-form/production-form";
import { ProductionRegister } from "@/components/dashboard/production-register/production-register";
import { StatCard } from "@/components/dashboard/stat-card/stat-card";
import { Factory, Package } from "lucide-react";

export default async function ProductionPage() {
    const session = await requireTraderSession(["manufacturer"]);

    const [products, inventory, config] = await Promise.all([
        getProducts(session.user.id),
        getInventory(),
        getSystemConfig(),
    ]);

    const totalStock = inventory.reduce((sum, s) => sum + s.quantity, 0);

    // Merge product data with stock quantities
    const productsWithStock = products.map((p) => {
        const stockItem = inventory.find((s) => s.productId === p.id);
        return {
            ...p,
            quantity: stockItem?.quantity ?? 0,
            latestUnitPrice: stockItem?.latestUnitPrice ?? null,
        };
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Production
                </h1>
                <p className="text-muted-foreground">
                    Register products and record production runs.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                    title="Your Products"
                    value={products.length}
                    icon={<Factory className="h-4 w-4" />}
                />
                <StatCard
                    title="Total Stock"
                    value={totalStock.toLocaleString()}
                    description="Units across all products"
                    icon={<Package className="h-4 w-4" />}
                />
                <StatCard
                    title="Product Types"
                    value={new Set(products.map((p) => p.unit)).size}
                    description="Unique unit types"
                />
            </div>

            {/* Production entry form */}
            <ProductionForm products={products} vatRate={config.vatRate} />

            {/* Production register / catalog */}
            <ProductionRegister products={productsWithStock} />
        </div>
    );
}
