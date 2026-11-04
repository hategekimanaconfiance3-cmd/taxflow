import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Store } from 'lucide-react';
import { getMerchantProfileById } from '@/lib/actions/merchant-profile.action';
import { MerchantProfileTabs } from '@/components/admin/merchant-profile-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function AdminTraderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // getMerchantProfileById handles its own auth (requireRRAPermission inside).
  // NEXT_REDIRECT from the auth guard is a non-Error throw — re-throw so Next.js
  // handles the redirect correctly.
  let data;
  try {
    data = await getMerchantProfileById(id);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw err; // NEXT_REDIRECT passthrough
  }

  if (!data) notFound();

  const { profile } = data;
  const displayName = profile.businessName ?? profile.name;

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div>
        <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 text-xs">
          <Link href="/admin/traders">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to search
          </Link>
        </Button>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted shrink-0">
            <Store className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {profile.tinNumber && (
                <span className="font-mono text-xs text-muted-foreground">
                  TIN: {profile.tinNumber}
                </span>
              )}
              {profile.role && (
                <Badge variant="outline" className="capitalize text-[10px]">
                  {profile.role}
                </Badge>
              )}
              {profile.clearanceStatus && (
                <Badge variant="secondary" className="capitalize text-[10px]">
                  {profile.clearanceStatus.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">
          Information shown is scoped to your authorised RRA role.
        </p>
      </div>

      {/* Full merchant profile — tabs are determined server-side by permissions */}
      <MerchantProfileTabs data={data} />
    </div>
  );
}
