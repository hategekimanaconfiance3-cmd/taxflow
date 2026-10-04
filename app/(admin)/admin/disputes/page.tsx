import { requireRRASession } from '@/lib/auth-guard';
import { getAllDisputes } from '@/lib/actions/dispute.action';
import { AdminDisputeActions } from '@/components/admin/admin-dispute-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Scale } from 'lucide-react';

export default async function AdminDisputesPage() {
  await requireRRASession();
  const disputes = await getAllDisputes();

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
        <CardContent className="space-y-4">
          {disputes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No disputes to review.</p>
          ) : (
            disputes.map((dispute) => (
              <div
                key={dispute.id}
                className="flex flex-col gap-3 border-b pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-medium">
                      {dispute.referenceNumber}
                    </p>
                    <Badge variant="outline" className="capitalize">
                      {dispute.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-sm">{dispute.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Filed by {dispute.filedByName ?? 'Unknown trader'} | Counterparty{' '}
                    {dispute.counterpartyName ?? 'Unknown trader'} | Response:{' '}
                    {dispute.counterpartyResponse}
                  </p>
                </div>
                <AdminDisputeActions
                  disputeId={dispute.id}
                  referenceNumber={dispute.referenceNumber}
                  filerName={dispute.filedByName ?? 'Unknown trader'}
                  counterpartyName={dispute.counterpartyName ?? 'Unknown trader'}
                  reason={dispute.reason}
                  counterpartyResponse={dispute.counterpartyResponse}
                  counterpartyNote={dispute.counterpartyNote}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
