import { requireRRASession } from '@/lib/auth-guard';
import { AdminDisputeActions } from '@/components/admin/admin-dispute-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scale } from 'lucide-react';

export default async function AdminDisputesPage() {
  await requireRRASession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Disputes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review and resolve trader disputes filed in the system.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Scale className="h-4 w-4 text-blue-500" />
            Dispute Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminDisputeActions />
        </CardContent>
      </Card>
    </div>
  );
}
