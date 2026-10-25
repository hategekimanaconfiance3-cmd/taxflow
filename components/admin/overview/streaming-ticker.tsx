'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/lib/socket-client';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TickerRow, TickerItem } from '@/app/api/admin/ticker/route';

type LiveTickerItem = TickerItem & { isNew?: boolean };

function relativeTime(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
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
};

function eventLabel(type: TickerItem['type']): string {
  if (type === 'transaction') return 'Transaction';
  if (type === 'import') return 'Import';
  return 'Tax payment';
}

function computeInsight(items: TickerItem[]): string {
  if (items.length === 0) return 'No recent transaction, import, or payment activity';
  const failed = items.filter((item) => ['rejected', 'failed'].includes(item.status));
  const highValue = items.filter((item) => item.amount >= 1_000_000);
  if (failed.length > 0 && highValue.length > 0) {
    return `${failed.length} failed record${failed.length !== 1 ? 's' : ''} · ${highValue.length} high-value record${highValue.length !== 1 ? 's' : ''} in the recent feed`;
  }
  if (failed.length > 0) return `${failed.length} failed record${failed.length !== 1 ? 's' : ''} in the recent feed`;
  if (highValue.length > 0) return `${highValue.length} high-value record${highValue.length !== 1 ? 's' : ''} in the recent feed`;
  return 'No rejected or high-value records in the recent feed';
}

interface StreamingTickerProps {
  userId: string;
  insight?: string;
}

export function StreamingTicker({ userId, insight }: StreamingTickerProps) {
  const [items, setItems] = useState<LiveTickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(false);

  const fetchTicker = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/ticker');
      if (!response.ok) throw new Error(`Ticker request failed (${response.status})`);
      const data = await response.json() as TickerRow;
      setItems(data.items);
    } catch (error) {
      console.error('[streaming-ticker] Failed to refresh recent activity', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    void fetchTicker();
  }, [fetchTicker]);

  useSocket(userId, {
    'txn:incoming': fetchTicker,
    'txn:confirmed': fetchTicker,
    'txn:rejected': fetchTicker,
  });

  const liveInsight = loading ? (insight ?? null) : computeInsight(items);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <Radio className="h-4 w-4 text-muted-foreground" />
          Recent Financial Activity
          <span className="text-[10px] font-normal text-muted-foreground">· transactions, imports, and payments</span>
        </CardTitle>
        {liveInsight && <p className="text-[10px] text-muted-foreground italic mt-0.5">{liveInsight}</p>}
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-10 rounded-md bg-muted/50 animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1">
            <p className="text-xs font-medium text-muted-foreground">No recent activity recorded</p>
            <p className="text-[10px] text-muted-foreground/60">Recent transactions, imports, and payments will appear here</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={`${item.type}-${item.id}`} className={cn('grid grid-cols-[minmax(0,1fr)_110px_100px_90px] items-center gap-3 rounded-md px-3 py-2 text-xs bg-muted/30')}>
                <div className="min-w-0 flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.businessName}</p>
                    <p className="text-[10px] text-muted-foreground">{eventLabel(item.type)}</p>
                  </div>
                </div>
                <span className="font-mono font-semibold whitespace-nowrap text-right">{formatRWF(item.amount)}</span>
                <Badge variant="outline" className={cn('justify-self-end text-[9px] px-1.5 py-0 h-4', STATUS_STYLES[item.status] ?? 'bg-zinc-500/10 text-zinc-600 border-zinc-200')}>
                  {item.status}
                </Badge>
                <time dateTime={item.createdAt} className="text-right text-[9px] text-muted-foreground/70">{relativeTime(item.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
