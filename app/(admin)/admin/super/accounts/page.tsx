import { requireRRASession } from '@/lib/auth-guard';
import { getSuperTraderAccountHistory, searchSuperTraderAccounts } from '@/lib/actions/super-trader-account.action';
import { SuperTraderAccountsWorkspace } from '@/components/admin/super/super-trader-accounts-workspace';

export default async function SuperTraderAccountsPage() {
  await requireRRASession('super_admin');
  const result = await searchSuperTraderAccounts({ search: '', role: 'all', status: 'all' });
  const initialAccounts = result.success ? result.data : [];
  const initialHistory = initialAccounts[0] ? await getSuperTraderAccountHistory({ traderId: initialAccounts[0].id }) : null;
  return <SuperTraderAccountsWorkspace initialAccounts={initialAccounts} initialHistory={initialHistory?.success ? initialHistory.data : []} initialError={result.success ? null : result.error} />;
}
