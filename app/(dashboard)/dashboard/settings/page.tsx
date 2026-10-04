import { requireTraderSession } from '@/lib/auth-guard';
import { ProfileForm } from '@/components/dashboard/settings/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Hash, Phone, Building2 } from 'lucide-react';

export default async function SettingsPage() {
  const session = await requireTraderSession();
  const { user } = session;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your business profile and account details.
        </p>
      </div>

      {/* Read-only info card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              <span>TIN Number</span>
            </div>
            <span className="font-mono text-xs">{user.tinNumber ?? '—'}</span>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>Role</span>
            </div>
            <Badge variant="outline" className="w-fit capitalize text-xs">{user.role}</Badge>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>Phone</span>
            </div>
            <span className="text-xs">{user.phoneNumber ?? '—'}</span>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            TIN, role, and phone number can only be updated by RRA staff. Contact support if they need to change.
          </p>
        </CardContent>
      </Card>

      {/* Editable profile */}
      <ProfileForm
        name={user.name ?? ''}
        businessName={user.businessName ?? ''}
      />
    </div>
  );
}
