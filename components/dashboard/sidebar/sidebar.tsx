'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth-client';
import { getSidebarGroups, ROLE_LABELS, ROLE_COLORS, type TraderRole } from '@/lib/sidebar-config';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, LogOut, ChevronDown, User, HelpCircle } from 'lucide-react';
import { CommandPalette, type CommandItem } from '@/components/ui/command-palette';

interface DashboardSidebarProps {
  role: TraderRole;
  businessName: string;
  userName?: string;
}

export function DashboardSidebar({ role, businessName, userName = 'User' }: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const groups = getSidebarGroups(role);

  // Build command palette items from sidebar config
  const commandItems: CommandItem[] = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items.map((item) => ({
          label: item.label,
          href: item.href,
          icon: item.icon,
          group: group.label || 'Navigation',
        })),
      ),
    [groups],
  );

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    // Action triggers with query params are never "active"
    if (href.includes('?')) return false;
    return pathname === href || pathname.startsWith(href);
  }

  return (
    <TooltipProvider delayDuration={300}>
      {/* ── Command Palette (F to open) ─────── */}
      <CommandPalette items={commandItems} portalLabel="TaxFlow" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-border/60 bg-background lg:flex">
        {/* ── Logo ─────────────────────────────── */}
        <div className="flex h-14 items-center gap-2.5 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
            TF
          </div>
          <span className="text-[15px] font-semibold tracking-tight">TaxFlow</span>
        </div>

        {/* ── Search trigger ───────────────────── */}
        <div className="px-3 pb-2">
          <button
            onClick={() => {
              // Simulate F key press to open command palette
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
            }}
            className="flex w-full items-center gap-2.5 rounded-md border border-border/60 px-3 py-[7px] text-sm transition-colors hover:bg-accent/50"
          >
            <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="flex-1 text-left text-muted-foreground/70 text-[13px]">Find...</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
              F
            </kbd>
          </button>
        </div>

        <Separator className="opacity-60" />

        {/* ── Navigation groups ─────────────────── */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {groups.map((group, gi) => (
            <div key={gi}>
              {/* Group label */}
              {group.label && (
                <div className="px-5 pt-4 pb-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </span>
                </div>
              )}

              {/* Items */}
              <div className="px-2 space-y-[2px]">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'group relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium transition-all duration-150',
                            active
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                          )}
                        >
                          {/* Active indicator bar */}
                          {active && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-foreground" />
                          )}
                          <item.icon
                            className={cn(
                              'h-4 w-4 shrink-0 transition-colors',
                              active ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground',
                            )}
                          />
                          {item.label}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Divider between groups (except last) */}
              {gi < groups.length - 1 && <Separator className="my-2 opacity-60" />}
            </div>
          ))}
        </nav>

        <Separator className="opacity-60" />

        {/* ── User section ─────────────────────── */}
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <Avatar className="h-7 w-7 border border-border/60">
                  <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate leading-none">{businessName}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{userName}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-[232px]">
              <div className="px-2 py-2">
                <p className="text-sm font-medium truncate">{businessName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', ROLE_COLORS[role])}>
                    {ROLE_LABELS[role]}
                  </Badge>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                <User className="mr-2 h-3.5 w-3.5" />
                Profile & Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/support')}>
                <HelpCircle className="mr-2 h-3.5 w-3.5" />
                Help & Support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await authClient.signOut({
                    fetchOptions: {
                      onSuccess: () => {
                        router.push('/sign-in');
                      },
                    },
                  });
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
