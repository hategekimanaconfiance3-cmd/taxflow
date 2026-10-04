import { requireRRASession } from '@/lib/auth-guard';
import { getVATSummaryByMonth } from '@/lib/actions/admin-report.action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrintReportButton } from '@/components/admin/print-report-button';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { FileText, TrendingUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function AdminReportsSummaryPage() {
  await requireRRASession();

  let monthlyData: Awaited<ReturnType<typeof getVATSummaryByMonth>> = [];
  try {
    monthlyData = await getVATSummaryByMonth();
  } catch {
    // Insufficient permissions (requires reporting_officer)
  }

  const totalGenerated = monthlyData.reduce((s, r) => s + r.generated, 0);
  const totalPaid = monthlyData.reduce((s, r) => s + r.paid, 0);
  const totalNet = monthlyData.reduce((s, r) => s + r.net, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Summary Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly VAT generation, collection, and net revenue summary.
          </p>
        </div>
        <PrintReportButton />
      </div>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total VAT Generated', value: totalGenerated, color: 'text-emerald-600' },
          { label: 'Total VAT Paid', value: totalPaid, color: 'text-blue-600' },
          { label: 'Net Outstanding', value: totalNet, color: totalNet > 0 ? 'text-red-600' : 'text-emerald-600' },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p className={`text-xl font-bold font-mono ${item.color}`}>
                {formatRWF(item.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Monthly VAT Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Generated</TableHead>
                <TableHead className="text-right">Paid (Input)</TableHead>
                <TableHead className="text-right">Net Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                    No report data available. Reporting officer access required.
                  </TableCell>
                </TableRow>
              )}
              {monthlyData.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-mono text-xs">{row.month}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-emerald-600">
                    {formatRWF(row.generated)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-blue-600">
                    {formatRWF(row.paid)}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-xs font-semibold ${row.net > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatRWF(row.net)}
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
