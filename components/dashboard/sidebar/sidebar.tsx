'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, useCallback } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, LogOut, ChevronDown, ChevronRight, User, HelpCircle } from 'lucide-react';
import { CommandPalette, type CommandItem } from '@/components/ui/command-palette';
import { useDashboardLayoutCtx } from '@/components/dashboard/dashboard-layout-client';
import { translate, translateWithContext } from '@/lib/language';
import { NotificationCountBadge } from '@/components/dashboard/notifications/notification-count-badge';

interface DashboardSidebarProps {
  role: TraderRole;
  businessName: string;
  userName?: string;
}

export function DashboardSidebar({ role, businessName, userName = 'User' }: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const groups = getSidebarGroups(role);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const { isSidebarCollapsed, sidebarW, expandSidebar, lang, unreadNotificationCount } = useDashboardLayoutCtx();

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = '/sign-in';
          },
        },
      });
    } catch (error) {
      console.error('Sign-out failed:', error);
      setIsSigningOut(false);
    }
  }, [isSigningOut]);

  // Build command palette items from sidebar config
  const commandItems: CommandItem[] = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items.map((item) => ({
          label: translate(item.label, lang),
          href: item.href,
          icon: item.icon,
          group: translate(group.label || 'Navigation', lang),
        })),
      ),
    [groups, lang],
  );

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href.includes('?')) return false;
    return pathname === href || pathname.startsWith(href);
  }

  // ── COLLAPSED SIDEBAR ──────────────────────────────────────────────────────
  const collapsedSidebar = (
    <div className="relative flex h-full flex-col items-center">
      {/* Logo */}
      <div className="flex h-14 w-full shrink-0 items-center justify-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
          TF
        </div>
      </div>

      <Separator className="opacity-60" />

      {/* Nav icons — with separators matching expanded groups */}
      <nav className="flex flex-1 flex-col items-center w-full overflow-y-auto scrollbar-thin py-1">
        {groups.map((group, gi) => (
          <div key={gi} className="w-full">
            <div className="flex flex-col items-center gap-0.5 px-2 py-1">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const translatedLabel = translate(item.label, lang);
                const notificationLabel = item.href === '/dashboard/notifications' && unreadNotificationCount > 0
                  ? `${translatedLabel}, ${unreadNotificationCount} unread`
                  : translatedLabel;
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-label={notificationLabel}
                        className={cn(
                          'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                          active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-foreground" />
                        )}
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {item.href === '/dashboard/notifications' && (
                          <NotificationCountBadge count={unreadNotificationCount} className="absolute -right-0.5 -top-0.5" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.href === '/dashboard/notifications' && unreadNotificationCount > 0
                        ? `${translate(item.label, lang)}, ${translateWithContext(`${unreadNotificationCount} unread notification${unreadNotificationCount !== 1 ? 's' : ''}`, lang)}`
                        : translate(item.label, lang)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            {gi < groups.length - 1 && <Separator className="opacity-60 my-1" />}
          </div>
        ))}
      </nav>

      <Separator className="opacity-60" />

      {/* User avatar popover */}
      <div className="flex w-full items-center justify-center py-3 shrink-0">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent transition-colors">
              <Avatar className="h-7 w-7 border border-border/60">
                <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-52 p-0">
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{businessName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{userName}</p>
            </div>
            <Separator className="opacity-60" />
            <div className="py-1">
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <User className="h-3.5 w-3.5" /> Profile & Settings
              </button>
              <button
                onClick={() => router.push('/dashboard/support')}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Help & Support
              </button>
            </div>
            <Separator className="opacity-60" />
            <div className="py-1">
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                {isSigningOut ? 'Signing out…' : 'Sign Out'}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );

  // ── FULL SIDEBAR ───────────────────────────────────────────────────────────
  const fullSidebar = (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
          TF
        </div>
        <span className="text-[15px] font-semibold tracking-tight">TaxFlow</span>
      </div>

      <div className="px-5 pb-3 lg:hidden">
        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', ROLE_COLORS[role])}>
          {translate(ROLE_LABELS[role], lang)}
        </Badge>
      </div>

      {/* Search trigger */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
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

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-5 pt-4 pb-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {translate(group.label, lang)}
                </span>
              </div>
            )}
            <div className="px-2 space-y-[2px]">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const translatedLabel = translate(item.label, lang);
                const notificationLabel = item.href === '/dashboard/notifications' && unreadNotificationCount > 0
                  ? `${translatedLabel}, ${unreadNotificationCount} unread`
                  : translatedLabel;
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-label={notificationLabel}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium transition-all duration-150',
                          active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-foreground" />
                        )}
                        <item.icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            active ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground',
                          )}
                        />
                        <span>{translatedLabel}</span>
                        {item.href === '/dashboard/notifications' && (
                          <NotificationCountBadge count={unreadNotificationCount} className="ml-auto" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {notificationLabel}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            {gi < groups.length - 1 && <Separator className="my-2 opacity-60" />}
          </div>
        ))}
      </nav>

      <Separator className="opacity-60" />

      {/* User section */}
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
                  {translate(ROLE_LABELS[role], lang)}
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
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              {isSigningOut ? 'Signing out…' : 'Sign Out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <CommandPalette items={commandItems} portalLabel="TaxFlow" />

      <aside
        className="fixed inset-y-0 left-0 z-30 hidden lg:flex flex-col border-r border-border/60 bg-background transition-[width] duration-300"
        style={{ width: sidebarW }}
      >
        <div className="flex h-full w-full flex-col overflow-hidden">
          {isSidebarCollapsed ? collapsedSidebar : fullSidebar}
        </div>

        {/* Expand chevron — outside overflow wrapper so it's not clipped */}
        {isSidebarCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={expandSidebar}
                className="absolute top-1/2 -right-3.5 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm text-muted-foreground hover:text-foreground hover:shadow-md transition-all duration-150"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        )}
      </aside>
    </TooltipProvider>
  );
}
