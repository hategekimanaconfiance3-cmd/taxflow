'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getAdminSidebarGroups, ROLE_LABELS, ROLE_COLORS, type RRARole } from '@/lib/admin-sidebar-config';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  LogOut, Menu, Shield, Bell, ChevronDown, ChevronRight, User, HelpCircle,
  Search, Brain, Send, Sparkles, RotateCcw, X, Check, Loader2,
} from 'lucide-react';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CommandPalette, type CommandItem } from '@/components/ui/command-palette';
import { authClient } from '@/lib/auth-client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { LANGS, translate, type LangCode } from '@/lib/language';
import { useLanguagePreference } from '@/lib/use-language';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SIDEBAR_FULL_W = 260;
const SIDEBAR_ICON_W = 64;
const AI_PANEL_W = 420;

const AI_SUGGESTIONS = [
  'Show system-wide statistics',
  'Trace the supply chain for Rice',
  'Show pending transaction confirmations',
  'Generate revenue forecast for 6 months',
];

// ---------------------------------------------------------------------------
// Language Selector
// ---------------------------------------------------------------------------
function LangSelector({ value, onChange }: { value: LangCode; onChange: (l: LangCode) => void }) {
  const current = LANGS.find((l) => l.code === value)!;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="font-semibold tracking-wide">{current.label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {translate('Language', value)}
        </p>
        {LANGS.map((lang) => (
          <button
            key={lang.code}
            onClick={() => onChange(lang.code)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-2">
              <span className="w-8 text-[11px] font-bold text-muted-foreground">{lang.label}</span>
              <span className="text-foreground">{lang.full}</span>
            </div>
            {value === lang.code && <Check className="h-3.5 w-3.5 text-blue-500" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Notification Bell
// ---------------------------------------------------------------------------
function NotificationBell({ href }: { href: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch('/api/admin/notification-count')
      .then((r) => r.ok ? r.json() : { count: 0 })
      .then((d) => setCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
          title="Notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-background" />
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {count > 0 ? `${count} unread notification${count !== 1 ? 's' : ''}` : 'Notifications'}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// AI Side Panel
// ---------------------------------------------------------------------------
function AIPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/ai/query' }),
  });
  const isLoading = status === 'streaming' || status === 'submitted';

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage({ text: input.trim() });
      setInput('');
    },
    [input, isLoading, sendMessage],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-violet-500/15 border">
            <Brain className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-none">Ask AI</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">RRA Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMessages([])} title="Clear">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="border-b bg-muted/20 px-4 py-2 text-[10px] text-muted-foreground">AI findings are advisory. An authorized RRA employee must review evidence and make any official decision.</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 pb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-gradient-to-br from-blue-500/10 to-violet-500/10">
              <Sparkles className="h-7 w-7 text-blue-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">Ask an RRA or business question</p>
              <p className="text-xs text-muted-foreground">Enter a TIN or ask about records, evidence, risks, and workflows. Official decisions stay with authorized staff.</p>
            </div>
            <div className="w-full space-y-1.5">
              {AI_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage({ text: s })}
                  className="w-full rounded-lg border px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isStreaming = i === messages.length - 1 && isLoading && !isUser;
            const content = msg.parts
              ?.filter((p) => p.type === 'text')
              .map((p) => (p as { type: 'text'; text: string }).text)
              .join('') ?? '';
            return (
              <div key={msg.id} className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
                {!isUser && (
                  <div className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 border flex items-center justify-center mt-0.5">
                    <Brain className="h-3 w-3 text-blue-600" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-[13px]',
                    isUser
                      ? 'bg-foreground text-background rounded-br-sm'
                      : 'bg-muted/60 text-foreground rounded-bl-sm',
                  )}
                >
                  {isStreaming && !content ? (
                    <div className="flex gap-1 items-center py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                    </div>
                  ) : content ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
                  ) : !isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">I couldn&apos;t produce a written answer. Please ask what you want to know about the TIN or record, or try your question again.</p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        {status === 'error' && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error ? "I couldn't complete that answer. Please try again or clear this chat and resend your question." : "The AI assistant could not complete this request. Please try again."}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="h-7 w-7 shrink-0"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Tip: Press <kbd className="rounded border px-1 font-mono text-[9px]">Ctrl</kbd> <kbd className="rounded border px-1 font-mono text-[9px]">I</kbd> to toggle
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminShell Props
// ---------------------------------------------------------------------------
interface AdminShellProps {
  userName: string;
  staffId: string;
  clearanceLevel: string;
  clearanceRoles: string[];
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// AdminShell
// ---------------------------------------------------------------------------
export function AdminShell({ userName, staffId, clearanceLevel, clearanceRoles, children }: AdminShellProps) {
  const pathname = usePathname();
  const groups = getAdminSidebarGroups(clearanceRoles.length ? clearanceRoles : [clearanceLevel]);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [lang, setLang] = useLanguagePreference();
  const roleSummary = (clearanceRoles.length ? clearanceRoles : [clearanceLevel])
    .map((role) => translate(ROLE_LABELS[role as RRARole] ?? role, lang)).join(", ");

  const openAI = useCallback(() => {
    setIsAiOpen(true);
    setIsSidebarCollapsed(true);
  }, []);

  const closeAI = useCallback(() => {
    setIsAiOpen(false);
    setIsSidebarCollapsed(false);
  }, []);

  const toggleAI = useCallback(() => (isAiOpen ? closeAI() : openAI()), [isAiOpen, closeAI, openAI]);

  // Ctrl+I toggles AI panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        toggleAI();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleAI]);

  const expandSidebar = () => {
    if (isAiOpen) setIsAiOpen(false);
    setIsSidebarCollapsed(false);
  };

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(null);
    setIsAccountMenuOpen(false);
    setIsMobileNavigationOpen(false);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.assign('/admin-login');
          },
        },
      });
    } catch {
      setIsSigningOut(false);
      setSignOutError('Sign out failed. Check your connection and try again.');
    }
  }, [isSigningOut]);

  // Build command palette items
  const commandItems: CommandItem[] = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items.flatMap((item) => [
          { label: translate(item.label, lang), href: item.href, icon: item.icon, group: translate(group.label || 'Overview', lang) },
          ...(item.children?.map((child) => ({
            label: translate(child.label, lang),
            href: child.href,
            icon: child.icon,
            group: translate(item.label, lang),
          })) ?? []),
        ]),
      ),
    [groups, lang],
  );

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const allHrefs = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])]),
      ),
    [groups],
  );

  function isActive(href: string): boolean {
    const cleanPathname = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const cleanHref = href.endsWith('/') ? href.slice(0, -1) : href;
    if (cleanHref.includes('?')) return false;
    if (cleanPathname === cleanHref) return true;
    if (cleanPathname.startsWith(cleanHref + '/')) {
      const hasMoreSpecificSibling = allHrefs.some((other) => {
        const cleanOther = other.endsWith('/') ? other.slice(0, -1) : other;
        return cleanOther !== cleanHref && cleanOther.length > cleanHref.length && cleanPathname.startsWith(cleanOther);
      });
      return !hasMoreSpecificSibling;
    }
    return false;
  }

  const sidebarW = isSidebarCollapsed ? SIDEBAR_ICON_W : SIDEBAR_FULL_W;

  // ── COLLAPSED SIDEBAR ────────────────────────────────────────────────────
  const collapsedSidebar = (
    <div className="relative flex h-full flex-col items-center">
      {/* Logo */}
      <div className="flex h-14 w-full shrink-0 items-center justify-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
          RRA
        </div>
      </div>

      <Separator className="opacity-60" />

      {/* Nav icons — with separators matching expanded groups */}
      <nav className="flex flex-1 flex-col items-center w-full overflow-y-auto scrollbar-thin py-1">
        {groups.map((group, gi) => (
          <div key={gi} className="w-full">
            <div className="flex flex-col items-center gap-0.5 px-2 py-1">
              {group.items.flatMap((item) => {
                // If item has children, render each child as its own icon
                if (item.children && item.children.length > 0) {
                  return item.children.map((child) => {
                    const active = isActive(child.href);
                    return (
                      <Tooltip key={child.href}>
                        <TooltipTrigger asChild>
                          <Link
                            href={child.href}
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
                            <child.icon className="h-[18px] w-[18px] shrink-0" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          {translate(child.label, lang)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  });
                }
                // No children — render the item itself
                const active = isActive(item.href);
                return [
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
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
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {translate(item.label, lang)}
                    </TooltipContent>
                  </Tooltip>,
                ];
              })}
            </div>
            {gi < groups.length - 1 && <Separator className="opacity-60 my-1" />}
          </div>
        ))}
      </nav>

      {/* System status dot */}
      <div className="flex h-8 w-full items-center justify-center shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative flex h-2 w-2 cursor-default">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">System Online</TooltipContent>
        </Tooltip>
      </div>

      <Separator className="opacity-60" />

      {/* User avatar */}
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
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{staffId}</p>
            </div>
            <Separator className="opacity-60" />
            <div className="py-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                {translate(isSigningOut ? 'Signing out…' : 'Log Out', lang)}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

    </div>
  );

  // ── FULL SIDEBAR ─────────────────────────────────────────────────────────
  const fullSidebar = (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-[10px] font-bold">
          RRA
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold tracking-tight leading-tight">TaxFlow</span>
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
            Administration
          </span>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-3 pb-2">
        <Button
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))}
          className="flex w-full items-center gap-2.5 rounded-md border border-border/60 px-3 py-1.75 text-sm transition-colors hover:bg-accent/50"
          variant="ghost"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
          <span className="flex-1 text-left text-muted-foreground/70 text-[13px]">Find...</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            F
          </kbd>
        </Button>
      </div>

      <Separator className="opacity-60" />

      {/* Nav groups */}
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
            <div className="px-2 space-y-0.5">
              {group.items.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const parentActive = hasChildren
                  ? item.children!.some((child) => isActive(child.href))
                  : isActive(item.href);
                return (
                  <div key={item.href}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          onClick={() => setIsMobileNavigationOpen(false)}
                          className={cn(
                            'group relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium transition-all duration-150',
                            parentActive
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                          )}
                        >
                          {parentActive && !hasChildren && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-foreground" />
                          )}
                          <item.icon
                            className={cn(
                              'h-4 w-4 shrink-0',
                              parentActive ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground',
                            )}
                          />
                          {translate(item.label, lang)}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">{translate(item.label, lang)}</TooltipContent>
                    </Tooltip>
                    {hasChildren && (
                      <div className="ml-3 pl-3 border-l border-border/40 mt-[2px] space-y-[2px]">
                        {item.children!.map((child) => {
                          const childActive = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setIsMobileNavigationOpen(false)}
                              className={cn(
                                'group relative flex items-center gap-2 rounded-md px-3 py-[6px] text-[12px] font-medium transition-all duration-150',
                                childActive
                                  ? 'bg-accent text-foreground'
                                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                              )}
                            >
                              {childActive && (
                                <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-foreground" />
                              )}
                              <child.icon
                                className={cn(
                                  'h-3.5 w-3.5 shrink-0',
                                  childActive ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground',
                                )}
                              />
                              {translate(child.label, lang)}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {gi < groups.length - 1 && <Separator className="my-2 opacity-60" />}
          </div>
        ))}
      </nav>

      {/* System status */}
      <div className="px-5 py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          System Online
        </div>
      </div>

      <Separator className="opacity-60" />

      {/* User section */}
      <div className="p-3">
        <div className="hidden lg:block">
        <Popover open={isAccountMenuOpen} onOpenChange={setIsAccountMenuOpen}>
          <PopoverTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <Avatar className="h-7 w-7 border border-border/60">
                <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate leading-none">{userName}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge
                    variant="outline"
                    className={cn('text-[9px] px-1 py-0 font-semibold', ROLE_COLORS[clearanceLevel as RRARole] || '')}
                  >
                    <Shield className="h-2.5 w-2.5 mr-0.5" />
                    {roleSummary}
                  </Badge>
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-58 p-0">
            <div className="px-3 py-3">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{staffId}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', ROLE_COLORS[clearanceLevel as RRARole] || '')}>
                    {roleSummary}
                </Badge>
              </div>
            </div>
            <Separator className="opacity-60" />
            <div className="py-1">
              <Link href="/admin/profile" onClick={() => setIsAccountMenuOpen(false)} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <User className="h-3.5 w-3.5" /> Profile
              </Link>
              <Link href="/admin/support" onClick={() => setIsAccountMenuOpen(false)} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <HelpCircle className="h-3.5 w-3.5" /> Help & Support
              </Link>
            </div>
            <Separator className="opacity-60" />
            <div className="py-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                {translate(isSigningOut ? 'Signing out…' : 'Log Out', lang)}
              </button>
            </div>
          </PopoverContent>
        </Popover>
        </div>
        <div className="space-y-1 lg:hidden">
          <div className="px-2 pb-2">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{staffId}</p>
            <Badge variant="outline" className={cn('mt-1.5 text-[10px] px-1.5 py-0', ROLE_COLORS[clearanceLevel as RRARole] || '')}>
              {roleSummary}
            </Badge>
          </div>
          <Link href="/admin/profile" className="flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <User className="h-4 w-4" /> Profile
          </Link>
          <Link href="/admin/support" className="flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <HelpCircle className="h-4 w-4" /> Help & Support
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {translate(isSigningOut ? 'Signing out…' : 'Log Out', lang)}
          </button>
          {signOutError && <p role="alert" className="px-2 pt-1 text-xs text-destructive">{signOutError}</p>}
        </div>
      </div>
    </>
  );

  // ── MOBILE SHEET SIDEBAR ─────────────────────────────────────────────────
  const mobileSidebar = fullSidebar;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <CommandPalette items={commandItems} portalLabel="RRA Admin" />

        {/* ── Desktop Sidebar ──────────────────────────────── */}
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

        {/* ── Content wrapper (shifts with sidebar / AI panel) ── */}
        <div
          className="flex min-h-screen min-w-0 flex-col transition-[padding] duration-300 lg:pl-[var(--sidebar-width)] xl:pr-[var(--ai-panel-width)]"
          style={{
            '--sidebar-width': `${sidebarW}px`,
            '--ai-panel-width': isAiOpen ? `${AI_PANEL_W}px` : '0px',
          } as React.CSSProperties}
        >
          {/* ── Topbar ──────────────────────────────────────── */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:gap-2 sm:px-4">
            {/* Mobile menu */}
            <Sheet open={isMobileNavigationOpen} onOpenChange={setIsMobileNavigationOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden -ml-1">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(86vw,18rem)] max-w-[18rem] p-0">
                <SheetTitle className="sr-only">Admin Navigation</SheetTitle>
                {mobileSidebar}
              </SheetContent>
            </Sheet>

            <div className="flex-1" />

            {/* Right side controls */}
            <div className="flex items-center gap-1">
              {/* Notification Bell */}
              <NotificationBell href="/admin/notifications" />

              <Separator orientation="vertical" className="h-5 mx-1" />

              {/* Language Selector */}
              <LangSelector value={lang} onChange={setLang} />

              {/* Ask AI button — hidden while panel is open */}
              {!isAiOpen && <Button
                variant="outline"
                size="sm"
                onClick={openAI}
                className="h-9 gap-1 px-2 text-xs font-medium sm:h-8 sm:gap-1.5 sm:px-3"
              >
                <Brain className="h-3.5 w-3.5" />
                <span className="sm:hidden">AI</span><span className="hidden sm:inline">Ask AI</span>
              </Button>}
            </div>
          </header>

          {/* ── Main content ────────────────────────────────── */}
          <main className="min-w-0 flex-1">
            <div className="min-w-0 p-3 sm:p-4 lg:p-6">{children}</div>
          </main>
        </div>

        {/* ── AI Side Panel ────────────────────────────────── */}
        {isAiOpen && (
          <div
            className="fixed inset-0 z-40 flex w-full max-w-full flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right-4 fade-in duration-200 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] lg:w-[420px]"
          >
            <AIPanel onClose={closeAI} />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
