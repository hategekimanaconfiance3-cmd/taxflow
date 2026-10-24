import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/admin-sidebar-config";
import { requireRRASession } from "@/lib/auth-guard";
import { Building2, Mail, Shield, UserRound } from "lucide-react";

export default async function AdminProfilePage() {
  const { user, staff } = await requireRRASession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">View your RRA staff account and assigned roles.</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="size-4" /> Staff account
          </CardTitle>
          <CardDescription>These details are managed by your RRA administrator.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="mt-1 font-medium">{user.name}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="size-3.5" /> Email</p>
            <p className="mt-1 break-all font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Staff ID</p>
            <p className="mt-1 font-mono font-medium">{staff.staffId}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3.5" /> Department</p>
            <p className="mt-1 font-medium">{staff.department || "Not assigned"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Shield className="size-3.5" /> Assigned roles</p>
            <div className="flex flex-wrap gap-2">
              {staff.clearanceRoles.map((role) => (
                <Badge key={role} variant="outline">{ROLE_LABELS[role]}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
