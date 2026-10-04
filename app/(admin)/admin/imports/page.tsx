import { requireRRASession } from '@/lib/auth-guard';
import { AdminImportActions } from '@/components/admin/admin-import-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ship } from 'lucide-react';

export default async function AdminImportsPage() {
  await requireRRASession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Declarations</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review, activate, and manage all trader import declarations.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Ship className="h-4 w-4" />
            Import Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminImportActions />
        </CardContent>
      </Card>
    </div>
  );
}
