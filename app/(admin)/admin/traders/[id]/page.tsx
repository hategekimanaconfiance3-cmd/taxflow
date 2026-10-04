import { requireRRASession } from '@/lib/auth-guard';
import { getTrader } from '@/lib/actions/admin.action';
import { TraderRiskPanel } from '@/components/admin/trader-risk-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, User, Hash, Phone, Calendar } from 'lucide-react';
import { notFound } from 'next/navigation';

export default async function AdminTraderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRRASession();
  const { id } = await params;

  let trader;
  try {
    trader = await getTrader(id);
  } catch {
    notFound();
  }

  const clearanceColors: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-700',
    under_review: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
    flagged: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {trader.businessName ?? trader.name}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Trader profile and compliance overview</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trader info card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Trader Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>Name</span>
              </div>
              <span className="font-medium">{trader.name}</span>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                <span>Business</span>
              </div>
              <span className="font-medium">{trader.businessName ?? '—'}</span>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-3.5 w-3.5" />
                <span>TIN</span>
              </div>
              <span className="font-mono text-xs">{trader.tinNumber ?? '—'}</span>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                <span>Phone</span>
              </div>
              <span>{trader.phoneNumber ?? '—'}</span>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Registered</span>
              </div>
              <span>
                {trader.createdAt
                  ? new Date(trader.createdAt).toLocaleDateString()
                  : '—'}
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t">
              <Badge variant="outline" className="capitalize">
                {trader.role ?? 'unknown'}
              </Badge>
              <Badge
                variant="secondary"
                className={`capitalize ${
                  clearanceColors[trader.clearanceStatus ?? ''] ?? 'bg-muted text-muted-foreground'
                }`}
              >
                {trader.clearanceStatus ?? 'unknown'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Risk breakdown */}
        <TraderRiskPanel />
      </div>
    </div>
  );
}
