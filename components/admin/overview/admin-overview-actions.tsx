'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { RegisterTaxpayerDialog } from '@/components/admin/register-taxpayer-dialog';
import { AdminBulkNotifyDialog } from '@/components/admin/admin-bulk-notify-dialog';
import { VATReturnDialog } from '@/components/admin/vat-return-dialog';

// Trader type expected by VATReturnDialog
type Trader = Parameters<typeof VATReturnDialog>[0]['traders'][number];

interface AdminOverviewActionsProps {
  traders: Trader[];
}

export function AdminOverviewActions({ traders }: AdminOverviewActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-2">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal px-1 pb-1">
          Admin Quick Actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mb-1.5" />
        {/* Each dialog renders its own trigger button inline */}
        <div className="space-y-1">
          <RegisterTaxpayerDialog />
          <AdminBulkNotifyDialog />
          <VATReturnDialog traders={traders} />
        </div>
        <DropdownMenuSeparator className="my-1.5" />
        <div className="px-1">
          <a
            href="/admin/exports"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Export Data →
          </a>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
