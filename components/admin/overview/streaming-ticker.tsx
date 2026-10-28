'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '@/lib/socket-client';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio } from 'lucide-react';
import type { TickerRow } from '@/app/api/admin/ticker/route';

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

interface StreamingTickerProps {
  userId: string;
  insight?: string;
}

export function StreamingTicker({ insight, userId }: StreamingTickerProps) {
  const [items, setItems] = useState<TickerRow['items']>([]);
  const [loading, setLoading] = useState(true);

  const fetchTicker = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/ticker');
      if (!response.ok) return;
      const data = await response.json() as TickerRow;
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchTicker(); }, [fetchTicker]);
  useSocket(userId, {
    'txn:incoming': fetchTicker,
    'txn:confirmed': fetchTicker,
    'txn:rejected': fetchTicker,
  });

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
          <Radio className="h-4 w-4 text-muted-foreground" />
          Live Transaction Feed
        </CardTitle>
        {insight && <p className="mt-0.5 text-[10px] italic text-muted-foreground">{insight}</p>}
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-3">
        {loading ? <p className="text-xs text-muted-foreground">Loading recent activity…</p>
          : items.length === 0 ? <p className="text-xs text-muted-foreground">No recent activity recorded.</p>
            : items.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.businessName}</p>
                  <p className="text-[10px] text-muted-foreground">{item.type} · {relativeTime(item.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{item.amount === null ? 'Amount unavailable' : item.currency && item.currency !== 'RWF' ? `${item.amount.toLocaleString()} ${item.currency}` : formatRWF(item.amount)}</span>
                  <Badge variant="outline" className="text-[9px]">{item.status}</Badge>
                </div>
              </div>
            ))}
      </CardContent>
    </Card>
  );
}
