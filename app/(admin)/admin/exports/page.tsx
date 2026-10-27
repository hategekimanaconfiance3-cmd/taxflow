import { requireRRASession } from '@/lib/auth-guard';
import { ExportDropdown } from '@/components/admin/admin-export';
import {
  ExportNationalData,
  ExportComplianceDataset,
} from '@/components/admin/bulk-export-buttons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download } from 'lucide-react';

export default async function AdminExportsPage() {
  await requireRRASession("reporting_officer", "director_executive", "data_ai_analyst");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Exports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Export national aggregate data for reporting and analysis. Taxpayer identifiers are excluded.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="h-4 w-4" />
            Quick Exports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ExportDropdown />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="h-4 w-4" />
            Bulk Dataset Exports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ExportNationalData />
          <ExportComplianceDataset />
        </CardContent>
      </Card>
    </div>
  );
}
