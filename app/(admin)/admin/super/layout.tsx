import { requireRRASession } from '@/lib/auth-guard';
import type { ReactNode } from 'react';
import { SuperAdminSearch } from '@/components/admin/super/super-admin-search';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  await requireRRASession('super_admin');

  return (
    <div className="space-y-5">
      {/* Super Admin header bar */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <div className="flex items-center gap-2 shrink-0">
          <ShieldAlert className="h-4 w-4 text-rose-500" />
          <Badge
            variant="outline"
            className="border-rose-200 text-rose-700 bg-rose-50/60 text-[10px] font-semibold tracking-wide"
          >
            SUPER ADMIN
          </Badge>
        </div>
        {/* Contextual search — SA-scoped */}
        <SuperAdminSearch />
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
