import { requireRRASession } from '@/lib/auth-guard';
import {
  ExportNationalData,
  ExportTaxpayerDirectory,
  ExportComplianceDataset,
} from '@/components/admin/bulk-export-buttons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download } from 'lucide-react';

export default async function AdminExportsPage() {
  await requireRRASession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Exports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Export system data in CSV or PDF format for reporting and analysis.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ExportNationalData />
          <ExportTaxpayerDirectory />
          <ExportComplianceDataset />
        </CardContent>
      </Card>
    </div>
  );
}
