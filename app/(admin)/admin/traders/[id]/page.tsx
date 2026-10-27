import { requireRRAPermission } from '@/lib/auth-guard';
import { getTraderLookupById } from '@/lib/actions/admin-tin-lookup.action';
import { TraderLookupDetails } from '@/components/admin/tin-taxpayer-lookup';
import { notFound } from 'next/navigation';

export default async function AdminTraderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRRAPermission("taxpayer.intelligence.search");
  const { id } = await params;
  const trader = await getTraderLookupById(id);
  if (!trader) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trader information</h1>
        <p className="text-muted-foreground text-sm mt-1">Information shown is limited to your RRA role.</p>
      </div>
      <TraderLookupDetails result={trader} />
    </div>
  );
}
