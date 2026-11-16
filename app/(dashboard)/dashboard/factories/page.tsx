import { FactoryManagement } from '@/components/dashboard/factory-management/factory-management';
import { getMyFactories } from '@/lib/actions/factory.action';
import { requireTraderSession } from '@/lib/auth-guard';

export default async function FactoriesPage() {
  await requireTraderSession(['manufacturer']);
  const factories = await getMyFactories();
  return <FactoryManagement initialFactories={factories} />;
}
