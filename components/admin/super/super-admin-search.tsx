'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Eye,
  UserCog,
  Lock,
  Server,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  Users,
  FileText,
  CornerDownLeft,
} from 'lucide-react';

type SearchResult = {
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'page' | 'action' | 'filter';
};

const STATIC_RESULTS: SearchResult[] = [
  // Pages
  { label: 'SA Overview', description: 'Super Admin command center', href: '/admin/super', icon: ShieldAlert, category: 'page' },
  { label: 'Admin Management', description: 'Staff accounts, roles, status', href: '/admin/super/admins', icon: UserCog, category: 'page' },
  { label: 'Security Center', description: 'Auth events, permission changes', href: '/admin/super/security', icon: Lock, category: 'page' },
  { label: 'System Health', description: 'Database latency, data counts', href: '/admin/super/system', icon: Server, category: 'page' },
  { label: 'Top Taxpayers', description: 'Top 20 by output VAT', href: '/admin/super/taxpayers', icon: TrendingUp, category: 'page' },
  { label: 'Audit Explorer', description: 'Full platform audit log', href: '/admin/super/audit', icon: Eye, category: 'page' },
  // Audit filters
  { label: 'Audit: Access Denials', description: 'Filter audit log for denied access', href: '/admin/super/audit?action=DENIED', icon: Lock, category: 'filter' },
  { label: 'Audit: Role Changes', description: 'Filter audit log for role modifications', href: '/admin/super/audit?action=ROLE_CHANGED', icon: Users, category: 'filter' },
  { label: 'Audit: Suspicious Flags', description: 'Filter audit log for suspicious activity', href: '/admin/super/audit?action=SUSPICIOUS', icon: ShieldAlert, category: 'filter' },
  { label: 'Audit: Config Changes', description: 'Filter audit log for system config edits', href: '/admin/super/audit?action=CONFIG', icon: Server, category: 'filter' },
  { label: 'Audit: KPI Targets', description: 'Filter audit log for KPI target changes', href: '/admin/super/audit?action=KPI_TARGET', icon: TrendingUp, category: 'filter' },
  { label: 'Audit: User events', description: 'Filter audit log by user target type', href: '/admin/super/audit?target=user', icon: UserCog, category: 'filter' },
  // Platform pages SA can access
  { label: 'Transactions', description: 'All platform transactions', href: '/admin/transactions', icon: ArrowRight, category: 'page' },
  { label: 'VAT & Tax', description: 'Platform VAT records', href: '/admin/tax', icon: FileText, category: 'page' },
  { label: 'Payments', description: 'Tax payment records', href: '/admin/payments', icon: FileText, category: 'page' },
  { label: 'Disputes', description: 'Open dispute management', href: '/admin/disputes', icon: FileText, category: 'page' },
  { label: 'Anomaly Detection', description: 'Risk and anomaly signals', href: '/admin/anomalies', icon: ShieldAlert, category: 'page' },
  { label: 'Audit Trail', description: 'Standard audit trail', href: '/admin/audit', icon: Eye, category: 'page' },
  { label: 'Settings', description: 'Platform settings', href: '/admin/settings', icon: Server, category: 'page' },
];

const CATEGORY_LABELS = {
  page: 'Pages',
  filter: 'Audit Filters',
  action: 'Actions',
};

interface SuperAdminSearchProps { size?: 'sm' | 'lg'; }

export function SuperAdminSearch({ size = 'sm' }: SuperAdminSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const filtered = query.trim().length === 0
    ? STATIC_RESULTS.filter((r) => r.category === 'page').slice(0, 6)
    : STATIC_RESULTS.filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.description.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8);

  // Group by category
  const grouped = filtered.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const cat = r.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  const flatFiltered = Object.values(grouped).flat();

  const navigate = useCallback((href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  }, [router]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, flatFiltered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatFiltered[selected]) navigate(flatFiltered[selected].href);
      } else if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, flatFiltered, selected, navigate]);

  // Reset selected when results change
  useEffect(() => { setSelected(0); }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  let flatIndex = 0;

  const isLarge = size === 'lg';

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search input */}
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none ${isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5'}`} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={isLarge ? "Search pages, audit filters, staff actions… (Ctrl+K)" : "Search SA pages, audit filters… (Ctrl+K)"}
          className={`w-full pr-10 bg-muted/50 border border-border rounded-md placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400 focus:bg-background transition-colors ${isLarge ? 'h-11 pl-10 text-sm' : 'h-8 pl-8 text-sm'}`}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <kbd className="hidden sm:inline-flex h-4 items-center gap-0.5 rounded border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">
            <span>⌃</span><span>K</span>
          </kbd>
        </div>
      </div>

      {/* Dropdown */}
      {open && flatFiltered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
          {Object.entries(grouped).map(([category, results]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
              </div>
              {results.map((result) => {
                const idx = flatIndex++;
                const isSelected = idx === selected;
                return (
                  <button
                    key={result.href}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => navigate(result.href)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      isSelected ? 'bg-rose-50 dark:bg-rose-950/30' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-rose-100 dark:bg-rose-900/50' : 'bg-muted'
                    }`}>
                      <result.icon className={`h-3.5 w-3.5 ${isSelected ? 'text-rose-600' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-rose-700 dark:text-rose-400' : ''}`}>
                        {result.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{result.description}</p>
                    </div>
                    {isSelected && (
                      <CornerDownLeft className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {open && query.trim().length > 0 && flatFiltered.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-background border border-border rounded-lg shadow-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
