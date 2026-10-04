import { requireApprovedClearance } from '@/lib/auth-guard';
import { getProducts } from '@/lib/actions/stock.action';
import { ImportForm } from '@/components/dashboard/import-form/import-form';

export default async function ImportsPage() {
  await requireApprovedClearance();

  const products = await getProducts();
  const formProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Declare Import</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Register an incoming import declaration. It will be reviewed and activated by RRA staff.
        </p>
      </div>

      <ImportForm products={formProducts} />
    </div>
  );
}
