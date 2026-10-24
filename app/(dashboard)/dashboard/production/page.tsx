import { requireTraderSession } from '@/lib/auth-guard';
import { getInventory, getProducts } from '@/lib/actions/stock.action';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { ProductionRegister } from '@/components/dashboard/production-register/production-register';
import { ProductionForm } from '@/components/dashboard/production-form/production-form';

export default async function ProductionPage() {
  const session = await requireTraderSession(['manufacturer']);

  const [inventory, registeredProducts, config] = await Promise.all([
    getInventory(),
    getProducts(session.user.id),
    getSystemConfig(),
  ]);

  const products = inventory.map((item) => ({
    id: item.productId,
    name: item.productName,
    unit: item.productUnit,
    categoryCode: null,
    createdAt: item.updatedAt ?? new Date(),
    quantity: item.quantity,
    latestUnitPrice: item.latestUnitPrice ?? null,
  }));

  const formProducts = registeredProducts.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Production</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Record production runs and manage your product inventory.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProductionForm products={formProducts} vatRate={config.vatRate} />
        <ProductionRegister products={products} />
      </div>
    </div>
  );
}
