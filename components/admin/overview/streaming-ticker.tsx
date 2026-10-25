'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/lib/socket-client';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio, ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TickerItem, TickerRow } from '@/lib/types/admin-ticker';
import { tickerRowsSchema } from '@/lib/validation/admin-ticker.schema';

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  completed: 'bg-blue-500/10 text-blue-700 border-blue-200',
  pending: 'bg-amber-500/10 text-amber-700 border-amber-200',
  rejected: 'bg-red-500/10 text-red-700 border-red-200',
  failed: 'bg-red-500/10 text-red-700 border-red-200',
  cancelled: 'bg-zinc-500/10 text-zinc-600 border-zinc-200',
  expired: 'bg-zinc-500/10 text-zinc-600 border-zinc-200',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Completed',
  completed: 'Completed',
  pending: 'Pending',
  rejected: 'Failed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Cancelled',
};

function productsSummary(items: TickerItem[]): string {
  if (items.length === 0) return '—';
  if (items.length === 1) return items[0].productName;
  return `${items[0].productName} +${items.length - 1} more`;
}

function computeInsight(rows: TickerRow[]): string {
  if (rows.length === 0) return 'No significant activity in the last 60 minutes';
  const failed = rows.filter((r) => ['rejected', 'failed'].includes(r.status));
  const highValue = rows.filter((r) => r.totalAmount >= 1_000_000); // ≥ 1M RWF
  if (failed.length > 0 && highValue.length > 0) {
    return `⚠️ ${failed.length} failed transaction${failed.length !== 1 ? 's' : ''} · ${highValue.length} high-value transaction${highValue.length !== 1 ? 's' : ''} detected`;
  }
  if (failed.length > 0) {
    return `⚠️ ${failed.length} failed transaction${failed.length !== 1 ? 's' : ''} in recent feed`;
  }
  if (highValue.length > 0) {
    return `⚠️ ${highValue.length} high-value transaction${highValue.length !== 1 ? 's' : ''} detected`;
  }
  return '✅ No suspicious activity detected';
}

interface ExpandableRowProps {
  row: TickerRow & { isNew?: boolean };
}

function ExpandableRow({ row }: ExpandableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasItems = row.items.length > 0;
  const isFailed = ['rejected', 'failed'].includes(row.status);

  return (
    <div
      className={cn(
        'rounded-md border transition-all duration-300',
        row.isNew
          ? 'border-emerald-200 bg-emerald-50/80'
          : isFailed
          ? 'border-red-100 bg-red-50/30'
          : 'border-transparent bg-muted/30 hover:bg-muted/50',
      )}
    >
      {/* ── Main row ── */}
      <button
        type="button"
        className="w-full text-left"
        onClick={() => hasItems && setExpanded((v) => !v)}
      >
        <div className="grid items-center gap-x-4 px-3 py-2 text-xs"
          style={{ gridTemplateColumns: '1fr 130px 110px 90px 100px' }}>
          {/* Business name + TIN */}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.businessName ?? 'Unknown Business'}
            </p>
            {row.tinNumber && (
              <p className="text-[9px] text-muted-foreground/60 font-mono">
                TIN: {row.tinNumber}
              </p>
            )}
          </div>

          {/* Products summary */}
          <span className="text-muted-foreground text-[11px] truncate hidden sm:block">
            {productsSummary(row.items)}
          </span>

          {/* Total amount */}
          <span className="font-mono font-semibold whitespace-nowrap text-right">
            {formatRWF(row.totalAmount)}
          </span>

          {/* VAT */}
          <span className="font-mono text-muted-foreground whitespace-nowrap text-right text-[10px]">
            {formatRWF(row.vatAmount)}
          </span>

          {/* Status + time + chevron */}
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1">
              <Badge
                variant="outline"
                className={cn('text-[9px] px-1.5 py-0 h-4 border', STATUS_STYLES[row.status] ?? 'bg-zinc-500/10 text-zinc-600 border-zinc-200')}
              >
                {STATUS_LABELS[row.status] ?? row.status}
              </Badge>
              {hasItems && (
                expanded
                  ? <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              )}
            </div>
            <span className="text-[9px] text-muted-foreground/60">{relativeTime(row.createdAt)}</span>
          </div>
        </div>
      </button>

      {/* ── Expanded items ── */}
      {expanded && hasItems && (
        <div className="border-t border-dashed border-muted px-3 pb-2 pt-1.5">
          <div className="space-y-1">
            {row.items.map((item, i) => (
              <div
                key={i}
                className="grid gap-x-4 text-[10px] text-muted-foreground"
                style={{ gridTemplateColumns: '1fr 130px 110px 90px' }}
              >
                <span className="truncate pl-1">{item.productName}</span>
                <span className="text-left whitespace-nowrap hidden sm:block">
                  {item.quantity} × {formatRWF(item.unitPrice)}
                </span>
                <span className="font-mono font-medium text-foreground text-right whitespace-nowrap">
                  {formatRWF(item.totalPrice)}
                </span>
                <span className="font-mono text-right whitespace-nowrap text-muted-foreground/70">
                  {formatRWF(item.vatAmount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StreamingTickerProps {
  userId: string;
  insight?: string;
}

export function StreamingTicker({ userId, insight }: StreamingTickerProps) {
  const [rows, setRows] = useState<(TickerRow & { isNew?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(false);

  const fetchTicker = useCallback(async (markNewId?: string) => {
    try {
      const res = await fetch('/api/admin/ticker');
      if (!res.ok) {
        setError('Transaction activity is temporarily unavailable.');
        return;
      }
      const parsed = tickerRowsSchema.safeParse(await res.json());
      if (!parsed.success) {
        setError('Transaction activity returned an invalid response. Please try again.');
        return;
      }
      setError(null);
      setRows(parsed.data.map((r) => ({ ...r, isNew: r.id === markNewId })));
    } catch (fetchError) {
      console.error('Failed to load transaction activity feed', fetchError);
      setError('Transaction activity is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    fetchTicker();
  }, [fetchTicker]);

  // Clear isNew after animation
  useEffect(() => {
    if (!rows.some((r) => r.isNew)) return;
    const t = setTimeout(() => setRows((prev) => prev.map((r) => ({ ...r, isNew: false }))), 1500);
    return () => clearTimeout(t);
  }, [rows]);

  useSocket(userId, {
    'txn:incoming': () => fetchTicker(),
    'txn:confirmed': () => fetchTicker(),
    'txn:rejected': () => fetchTicker(),
  });

  // Use server-passed insight as default; override with live data once loaded
  const liveInsight = error ? null : loading ? (insight ?? null) : computeInsight(rows);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <Radio className="h-4 w-4 text-muted-foreground" />
          Live Transaction Feed
          <span className="text-[10px] font-normal text-muted-foreground">· priority view</span>
        </CardTitle>
        {liveInsight && (
          <p className="text-[10px] text-muted-foreground italic mt-0.5">{liveInsight}</p>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1">
            <p className="text-xs font-medium text-muted-foreground">No significant activity in the last 60 minutes</p>
            <p className="text-[10px] text-muted-foreground/60">Failed, high-value and flagged transactions will appear here</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* ── Column headers ── */}
            <div
              className="grid gap-x-4 px-3 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide"
              style={{ gridTemplateColumns: '1fr 130px 110px 90px 100px' }}
            >
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Business
              </span>
              <span className="hidden sm:block text-left">Products</span>
              <span className="text-right">Amount</span>
              <span className="text-right">VAT</span>
              <span className="text-right">Status</span>
            </div>

            {rows.map((row) => (
              <ExpandableRow key={row.id} row={row} />
            ))}

            <p className="text-[9px] text-muted-foreground/40 text-center pt-1">
              Click a row to expand line items · Showing top {rows.length} by priority
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
