import { requireRRASession } from '@/lib/auth-guard';
import { getAuditLogs } from '@/lib/actions/admin.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollText } from 'lucide-react';

export default async function AdminAuditPage() {
  await requireRRASession();

  let logs: Awaited<ReturnType<typeof getAuditLogs>> = [];
  try {
    logs = await getAuditLogs({ limit: 100 });
  } catch {
    // Insufficient role — show empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Immutable record of all administrative and trader actions in the system.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Recent Actions ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target Type</TableHead>
                <TableHead>Target ID</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    No audit logs available. Super admin access required.
                  </TableCell>
                </TableRow>
              )}
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs font-medium">
                    {log.businessName ?? log.userName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.targetType ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                    {log.targetId ? log.targetId.slice(0, 12) + '…' : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
