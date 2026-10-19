import { requireRRASession } from '@/lib/auth-guard';
import { getBulletins } from '@/lib/actions/admin-bulletin.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, Pin } from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  urgent: { label: 'Urgent', cls: 'bg-red-100 text-red-700' },
  important: { label: 'Important', cls: 'bg-amber-100 text-amber-700' },
  info: { label: 'Info', cls: 'bg-blue-100 text-blue-700' },
};

export default async function AdminBulletinPage() {
  await requireRRASession("compliance_officer", "audit_officer", "stock_officer", "correction_officer", "reporting_officer", "director_executive", "tax_compliance_officer", "audit_investigation_officer", "product_traceability_officer", "customs_import_officer", "payments_reconciliation_officer", "data_ai_analyst");

  const bulletins = await getBulletins();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff Bulletin Board</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Internal communications and announcements for RRA staff.
        </p>
      </div>

      {bulletins.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/30" />
            <p className="font-semibold text-sm">No bulletins yet</p>
            <p className="text-xs text-muted-foreground">
              Staff bulletins posted by RRA officers will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bulletins.map((bulletin) => {
            const cfg = PRIORITY_CONFIG[bulletin.priority] ?? PRIORITY_CONFIG.info;
            return (
              <Card key={bulletin.id} className={bulletin.priority === 'urgent' ? 'border-red-200' : ''}>
                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {bulletin.priority === 'urgent' && (
                        <Pin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <CardTitle className="text-sm font-semibold truncate">
                        {bulletin.title}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className={`text-[10px] ${cfg.cls}`}>
                        {cfg.label}
                      </Badge>
                      {bulletin.department && (
                        <Badge variant="outline" className="text-[10px]">
                          {bulletin.department}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 space-y-2">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {bulletin.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Posted by {bulletin.authorName} ·{' '}
                    {new Date(bulletin.createdAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
