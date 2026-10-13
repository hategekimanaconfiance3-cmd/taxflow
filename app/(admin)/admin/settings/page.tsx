import { requireRRASession } from '@/lib/auth-guard';
import { asc, eq } from 'drizzle-orm';
import db from '@/db/drizzle';
import { rraStaff, user } from '@/db/schema';
import { getSystemConfig } from '@/lib/actions/system-config.action';
import { SystemConfigEditor } from '@/components/admin/system-config-editor';
import { StaffManagement, type StaffManagementMember } from '@/components/admin/staff-management';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Users } from 'lucide-react';

export default async function AdminSettingsPage() {
  const { staff } = await requireRRASession();

  const config = await getSystemConfig();
  let staffMembers: StaffManagementMember[] = [];
  if (staff.clearanceLevel === 'super_admin') {
    staffMembers = await db
      .select({
        id: rraStaff.id,
        staffId: rraStaff.staffId,
        name: user.name,
        email: user.email,
        department: rraStaff.department,
        clearanceLevel: rraStaff.clearanceLevel,
        isActive: rraStaff.isActive,
      })
      .from(rraStaff)
      .innerJoin(user, eq(rraStaff.userId, user.id))
      .orderBy(asc(rraStaff.staffId));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure system-wide parameters: VAT rate, compliance thresholds, and dispute windows.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4" />
            System Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SystemConfigEditor
            complianceThreshold={config.complianceThreshold}
            vatRate={config.vatRate}
            disputeWindowHours={config.disputeWindowHours}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Staff Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {staff.clearanceLevel === 'super_admin' ? (
            <StaffManagement staffMembers={staffMembers} />
          ) : (
            <p className="text-muted-foreground text-sm">Staff account management is available to Super Admins.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
