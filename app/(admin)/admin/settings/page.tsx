import { requireRRASession } from "@/lib/auth-guard";
import db from "@/db/drizzle";
import { rraStaff, user } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Settings, Users, Shield } from "lucide-react";
import {
    StaffClearanceSelect,
    StaffToggleButton,
} from "@/components/admin/staff-management";
import { SystemConfigEditor } from "@/components/admin/system-config-editor";
import { getSystemConfig } from "@/lib/actions/system-config.action";

const CLEARANCE_COLORS: Record<string, string> = {
    super_admin: "bg-rose-500/10 text-rose-600",
    compliance_officer: "bg-violet-500/10 text-violet-600",
    audit_officer: "bg-amber-500/10 text-amber-600",
    stock_officer: "bg-blue-500/10 text-blue-600",
    correction_officer: "bg-emerald-500/10 text-emerald-600",
    reporting_officer: "bg-cyan-500/10 text-cyan-600",
};

export default async function AdminSettingsPage() {
    await requireRRASession("super_admin");

    const [staff, config] = await Promise.all([
        db
            .select({
                id: rraStaff.id,
                staffId: rraStaff.staffId,
                department: rraStaff.department,
                clearanceLevel: rraStaff.clearanceLevel,
                isActive: rraStaff.isActive,
                createdAt: rraStaff.createdAt,
                userName: user.name,
                userEmail: user.email,
            })
            .from(rraStaff)
            .innerJoin(user, eq(rraStaff.userId, user.id))
            .orderBy(desc(rraStaff.createdAt)),
        getSystemConfig(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Settings
                </h1>
                <p className="text-muted-foreground">
                    System configuration and staff management.
                </p>
            </div>

            {/* System Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
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

            {/* Staff Management */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        RRA Staff ({staff.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {staff.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No staff records.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Staff ID</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Clearance</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {staff.map((s) => (
                                    <TableRow key={s.id}>
                                        <TableCell className="font-medium text-sm">
                                            {s.userName}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {s.staffId}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {s.userEmail}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {s.department ?? "—"}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs capitalize ${CLEARANCE_COLORS[s.clearanceLevel] ?? ""}`}
                                            >
                                                <Shield className="h-3 w-3 mr-1" />
                                                {s.clearanceLevel.replace(
                                                    "_",
                                                    " ",
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={`text-xs ${s.isActive
                                                    ? "bg-emerald-500/10 text-emerald-600"
                                                    : "bg-red-500/10 text-red-600"
                                                    }`}
                                            >
                                                {s.isActive
                                                    ? "Active"
                                                    : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center gap-2 justify-end">
                                                <StaffClearanceSelect
                                                    staffId={s.id}
                                                    currentLevel={s.clearanceLevel}
                                                />
                                                <StaffToggleButton
                                                    staffId={s.id}
                                                    isActive={s.isActive}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
