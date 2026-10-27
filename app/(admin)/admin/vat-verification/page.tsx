import { requireRRASession } from '@/lib/auth-guard';
import { getVatVerification } from '@/lib/actions/admin-vat-verify.action';
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
import { ShieldCheck } from 'lucide-react';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';

const STATUS_COLORS: Record<string, string> = {
  matching: 'bg-emerald-100 text-emerald-700',
  minor: 'bg-blue-100 text-blue-700',
  significant: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

export default async function AdminVatVerificationPage() {
  await requireRRASession("compliance_officer", "audit_officer", "tax_compliance_officer", "audit_investigation_officer");

  let discrepancies: Awaited<ReturnType<typeof getVatVerification>> = [];
  try {
    discrepancies = await getVatVerification();
  } catch {
    // Insufficient permissions — show empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">VAT Verification</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Compare declared VAT vs actual transaction-based VAT across all traders.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            VAT Discrepancy Report ({discrepancies.length} traders)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trader</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Declared Output</TableHead>
                <TableHead className="text-right">Actual Output</TableHead>
                <TableHead className="text-right">Discrepancy</TableHead>
                <TableHead className="text-right">Pct</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discrepancies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No VAT verification data. Compliance officer access required.
                  </TableCell>
                </TableRow>
              )}
              {discrepancies.map((d) => (
                <TableRow key={d.traderId}>
                  <TableCell className="font-medium text-xs">{d.traderName}</TableCell>
                  <TableCell className="capitalize text-xs text-muted-foreground">{d.role}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatRWF(d.declaredOutput)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatRWF(d.actualOutput)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatRWF(Math.abs(d.totalDiscrepancy))}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {d.discrepancyPct.toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] capitalize ${STATUS_COLORS[d.status] ?? ''}`}
                    >
                      {d.status}
                    </Badge>
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
