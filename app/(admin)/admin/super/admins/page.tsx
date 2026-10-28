import { requireRRASession } from '@/lib/auth-guard';
import db from '@/db/drizzle';
import { rraStaff, rraStaffRole, user } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, Activity, Clock, UserCog } from 'lucide-react';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/admin-sidebar-config';
import type { RRARole } from '@/lib/auth-guard';

export default async function AdminManagementPage() {
  await requireRRASession('super_admin');

  const staffRows = await db
    .select({
      staffId: rraStaff.id,
      userId: rraStaff.userId,
      department: rraStaff.department,
      isActive: rraStaff.isActive,
      clearanceLevel: rraStaff.clearanceLevel,
      createdAt: rraStaff.createdAt,
      updatedAt: rraStaff.updatedAt,
      name: user.name,
      email: user.email,
    })
    .from(rraStaff)
    .innerJoin(user, eq(user.id, rraStaff.userId))
    .orderBy(desc(rraStaff.createdAt));

  const roleRows = await db
    .select({ staffRecordId: rraStaffRole.staffRecordId, role: rraStaffRole.role })
    .from(rraStaffRole);

  const rolesByStaff = new Map<string, string[]>();
  for (const r of roleRows) {
    const existing = rolesByStaff.get(r.staffRecordId) ?? [];
    rolesByStaff.set(r.staffRecordId, [...existing, r.role]);
  }

  const staff = staffRows.map((s) => ({
    ...s,
    roles: rolesByStaff.get(s.staffId) ?? [s.clearanceLevel].filter(Boolean),
  }));

  const activeCount = staff.filter((s) => s.isActive).length;
  const superAdmins = staff.filter((s) => s.roles.includes('super_admin')).length;
  const inactive = staff.length - activeCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserCog className="h-6 w-6 text-rose-500" />
          Admin Management
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          All RRA staff accounts, roles, and access status — Super Admin view
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Total Staff
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{staff.length}</div>
            <p className="text-xs text-muted-foreground mt-0.5">registered administrators</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-emerald-500" /> Active
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
            <p className="text-xs text-muted-foreground mt-0.5">currently active accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-rose-500" /> Super Admins
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-rose-600">{superAdmins}</div>
            <p className="text-xs text-muted-foreground mt-0.5">super admin accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" /> Inactive
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-amber-600">{inactive}</div>
            <p className="text-xs text-muted-foreground mt-0.5">suspended or deactivated</p>
          </CardContent>
        </Card>
      </div>

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Staff Members</CardTitle>
          <CardDescription>
            {staff.length} total · {activeCount} active · To change roles or permissions, use{' '}
            <a href="/admin/settings" className="text-primary hover:underline">
              Staff Management → Settings
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No staff members found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground text-xs">Name</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground text-xs">Email</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground text-xs">Roles</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground text-xs">Department</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground text-xs">Joined</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.staffId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium">{s.name ?? '—'}</td>
                      <td className="py-3 px-2 text-muted-foreground text-xs">{s.email ?? '—'}</td>
                      <td className="py-3 px-2">
                        <div className="flex flex-wrap gap-1">
                          {s.roles.slice(0, 3).map((role) => (
                            <Badge
                              key={role}
                              variant="outline"
                              className={`text-[10px] px-1.5 h-5 ${ROLE_COLORS[role as RRARole] ?? 'bg-muted'}`}
                            >
                              {ROLE_LABELS[role as RRARole] ?? role}
                            </Badge>
                          ))}
                          {s.roles.length > 3 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                              +{s.roles.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground text-xs">{s.department ?? '—'}</td>
                      <td className="py-3 px-2">
                        <Badge
                          variant="outline"
                          className={
                            s.isActive
                              ? 'border-emerald-200 text-emerald-700 bg-emerald-50/60 text-[10px] h-5 px-1.5'
                              : 'border-red-200 text-red-700 bg-red-50/60 text-[10px] h-5 px-1.5'
                          }
                        >
                          {s.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground text-xs">
                        {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-2">
                        <a
                          href="/admin/settings"
                          className="text-xs text-primary hover:underline"
                        >
                          Manage →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
