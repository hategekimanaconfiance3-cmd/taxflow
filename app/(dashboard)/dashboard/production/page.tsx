import { randomUUID } from 'node:crypto';
import { ProductionForm } from '@/components/dashboard/production-form/production-form';
import { ProductionRegister } from '@/components/dashboard/production-register/production-register';
import { RecipeManager } from '@/components/dashboard/production-form/recipe-manager';
import { ProductionMaterialAccountingPanel } from '@/components/dashboard/production-form/production-material-accounting-panel';
import { ProductionMaterialPlanManager } from '@/components/dashboard/production-form/production-material-plan-manager';
import { requireTraderSession } from '@/lib/auth-guard';
import { listManufacturerProduction, listManufacturerProducts, listManufacturerRecipes } from '@/lib/production-service';
import { listIncomingConfirmedTransactions, listManufacturerMaterialAccounting, listManufacturerMaterialPlans } from '@/lib/material-accounting-service';
import { getSystemConfig } from '@/lib/actions/system-config.action';

function logLoadFailure(operation: string, requestId: string, error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[production:${operation}] requestId=${requestId}`, error);
    return;
  }
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
  console.error(`[production:${operation}]`, { requestId, errorName, errorCode });
}

export default async function ProductionPage() {
  const session = await requireTraderSession(['manufacturer']);
  const requestId = randomUUID();
  const [productsResult, recordsResult, configResult, recipesResult, accountingResult, incomingResult, plansResult] = await Promise.allSettled([
    listManufacturerProducts(session.user.id),
    listManufacturerProduction(session.user.id),
    getSystemConfig(),
    listManufacturerRecipes(session.user.id),
    listManufacturerMaterialAccounting(session.user.id),
    listIncomingConfirmedTransactions(session.user.id),
    listManufacturerMaterialPlans(session.user.id),
  ]);

  if (productsResult.status === 'rejected') logLoadFailure('products', requestId, productsResult.reason);
  if (recordsResult.status === 'rejected') logLoadFailure('history', requestId, recordsResult.reason);
  if (configResult.status === 'rejected') logLoadFailure('tax-config', requestId, configResult.reason);
  if (recipesResult.status === 'rejected') logLoadFailure('recipes', requestId, recipesResult.reason);
  if (accountingResult.status === 'rejected') logLoadFailure('material-accounting', requestId, accountingResult.reason);
  if (incomingResult.status === 'rejected') logLoadFailure('incoming-material-transactions', requestId, incomingResult.reason);
  if (plansResult.status === 'rejected') logLoadFailure('material-plans', requestId, plansResult.reason);

  const products = productsResult.status === 'fulfilled' ? productsResult.value : [];
  const records = recordsResult.status === 'fulfilled' ? recordsResult.value : [];
  const vatRate = configResult.status === 'fulfilled' ? configResult.value.vatRate : 0;
  const recipes = recipesResult.status === 'fulfilled' ? recipesResult.value : [];
  const accounting = accountingResult.status === 'fulfilled' ? accountingResult.value : { materials: [], receipts: [], eligibleImports: [] };
  const incomingTransactions = incomingResult.status === 'fulfilled' ? incomingResult.value : [];
  const plans = plansResult.status === 'fulfilled' ? plansResult.value : [];
  const hasLoadError = productsResult.status === 'rejected'
    || recordsResult.status === 'rejected'
    || configResult.status === 'rejected'
    || recipesResult.status === 'rejected'
    || accountingResult.status === 'rejected'
    || incomingResult.status === 'rejected'
    || plansResult.status === 'rejected';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Production</h1>
        <p className="mt-1 text-sm text-muted-foreground">Record production runs and manage your product inventory.</p>
      </div>

      {hasLoadError && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Some production information could not be loaded. Refresh the page or contact support with reference {requestId}.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ProductionForm products={products} recipes={recipes} plans={plans} vatRate={vatRate} />
        <ProductionRegister records={records} />
      </div>
      <RecipeManager products={products.map(({ id, name, unit }) => ({ id, name, unit }))} />
      <ProductionMaterialPlanManager products={products.map(({ id, name, unit }) => ({ id, name, unit }))} recipes={recipes} plans={plans} />
      <ProductionMaterialAccountingPanel materials={accounting.materials} receipts={accounting.receipts} eligibleImports={accounting.eligibleImports} incomingTransactions={incomingTransactions} />
    </div>
  );
}
