import Link from "next/link";
import { ArrowUpRight, Layers3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSidebarGroups } from "@/lib/admin-sidebar-config";
import type { RRARole } from "@/lib/rra-rbac";

export function RoleWorkspace({ roles }: { roles: RRARole[] }) {
  const modules = getAdminSidebarGroups(roles)
    .flatMap((group) => group.items)
    .filter((item) => item.href !== "/admin/dashboard/overview")
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => child.href !== "/admin/dashboard/overview"),
    }));

  return (
    <section className="space-y-4" aria-labelledby="role-workspace-title">
      <div>
        <h2 id="role-workspace-title" className="text-lg font-semibold">Your RRA workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">Modules available to your assigned roles. Each module checks access again on the server.</p>
      </div>
      {modules.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">No operational modules are assigned to your current role.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.href} className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" />{module.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(module.children?.length ? module.children : [{ label: `Open ${module.label}`, href: module.href, icon: Layers3 }]).map((child) => (
                    <Link key={child.href} href={child.href} className="flex items-center justify-between rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                      <span>{child.label}</span><ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
