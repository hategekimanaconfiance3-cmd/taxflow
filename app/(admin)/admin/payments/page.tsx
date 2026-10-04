import { requireRRASession } from '@/lib/auth-guard';
import { AdminPaymentActions } from '@/components/admin/admin-payment-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Banknote } from 'lucide-react';

export default async function AdminPaymentsPage() {
  await requireRRASession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of all tax payments received from traders, including confirmation and reconciliation.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-500" />
            Payment Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminPaymentActions />
        </CardContent>
      </Card>
    </div>
  );
}
