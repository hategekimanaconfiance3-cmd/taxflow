'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/lib/socket-client';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Activity, Wifi, WifiOff, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';

type PulsePoint = { minute: string; value: number; count: number };

function buildPulse(raw: PulsePoint[]): PulsePoint[] {
  if (raw.length === 60) return raw;
  const now = new Date();
  const map = new Map(raw.map((r) => [r.minute, r]));
  return Array.from({ length: 60 }, (_, i) => {
    const ts = new Date(now.getTime() - (59 - i) * 60 * 1000);
    const label = ts.toTimeString().slice(0, 5);
    return map.get(label) ?? { minute: label, value: 0, count: 0 };
  });
}

interface CommandCenterHeroProps {
  userId: string;
  todayCount: number;
  todayValue: number;
  weekCount: number;
  weekValue: number;
  pendingDisputes?: number;
  pendingPayments?: number;
  insight?: string;
}

export function CommandCenterHero({
  userId,
  todayCount,
  todayValue,
  weekCount,
  weekValue,
  pendingDisputes = 0,
  pendingPayments = 0,
  insight,
}: CommandCenterHeroProps) {
  const [pulse, setPulse] = useState<PulsePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(false);

  const fetchPulse = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ebm-pulse');
      if (!res.ok) return;
      const data: PulsePoint[] = await res.json();
      setPulse(buildPulse(data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    fetchPulse();
  }, [fetchPulse]);

  const { connected } = useSocket(userId, {
    'txn:incoming': () => {
      setPulse((prev) => {
        if (!prev.length) return prev;
        const now = new Date().toTimeString().slice(0, 5);
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (next[lastIdx].minute === now) {
          next[lastIdx] = { ...next[lastIdx], count: next[lastIdx].count + 1 };
        }
        return next;
      });
      fetchPulse();
    },
    'txn:confirmed': () => fetchPulse(),
  });

  const noActivityLastHour =
    pulse.length > 0 && pulse.every((p) => p.value === 0 && p.count === 0);

  // Today vs week daily average
  const weekDailyAvg = weekCount > 0 ? weekCount / 7 : 0;
  const todayVsWeekAvg =
    weekDailyAvg > 0 ? Math.round((todayCount / weekDailyAvg) * 100) : null;

  const PulseTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-md border bg-background px-3 py-2 shadow-md text-xs">
        <p className="font-medium">{label}</p>
        <p className="text-emerald-600 font-mono">{formatRWF(payload[0]?.value ?? 0)}</p>
      </div>
    );
  };

  const pendingTotal = pendingDisputes + pendingPayments;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Live Transaction Flow — 2/3 width */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              Live Transaction Flow
              <span className="text-[10px] font-normal text-muted-foreground">· last 60 min</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {connected ? (
                <Badge variant="outline" className="text-[10px] gap-1 border-emerald-200 text-emerald-600 bg-emerald-50/50 h-5 px-1.5">
                  <Wifi className="h-2.5 w-2.5" /> Live
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground h-5 px-1.5">
                  <WifiOff className="h-2.5 w-2.5" /> Offline
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground font-mono">
                {todayCount === 0 ? 'No txns today' : `${todayCount} txn today`}
              </span>
            </div>
          </div>
        </CardHeader>
        {insight && (
          <p className="text-[10px] text-muted-foreground italic px-4 pb-1">{insight}</p>
        )}
        <CardContent className="px-2 pb-3">
          {loading ? (
            <div className="h-[180px] flex items-center justify-center">
              <div className="h-5 w-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
          ) : noActivityLastHour ? (
            <div className="h-[180px] flex flex-col items-center justify-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">No activity in last 60 minutes</p>
              <p className="text-xs text-muted-foreground/60">Waiting for incoming transactions...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={pulse} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                <XAxis
                  dataKey="minute"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  interval={9}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) => (v === 0 ? '0' : formatRWF(v).replace(' RWF', ''))}
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip content={<PulseTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#pulseGradient)"
                  dot={false}
                  activeDot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                  isAnimationActive={pulse.some((p) => p.value > 0)}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Today at a Glance — replaces Collection Velocity */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-500" />
            Today at a Glance
          </CardTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </CardHeader>
        <CardContent className="pb-3 pt-0 space-y-3">
          {/* Today transactions */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Transactions today</span>
              {todayVsWeekAvg !== null && (
                <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${
                  todayVsWeekAvg >= 100 ? 'text-emerald-600' : todayVsWeekAvg >= 50 ? 'text-amber-600' : 'text-muted-foreground'
                }`}>
                  {todayVsWeekAvg >= 100
                    ? <TrendingUp className="h-2.5 w-2.5" />
                    : todayVsWeekAvg >= 50
                    ? <Minus className="h-2.5 w-2.5" />
                    : <TrendingDown className="h-2.5 w-2.5" />}
                  {todayVsWeekAvg}% of 7d avg
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold">{todayCount.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">txns</span>
            </div>
            <div className="text-xs text-muted-foreground font-mono">{formatRWF(todayValue)} value</div>
          </div>

          <div className="border-t pt-3 space-y-1">
            <span className="text-xs text-muted-foreground">This week</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold">{weekCount.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">txns</span>
            </div>
            <div className="text-xs text-muted-foreground font-mono">{formatRWF(weekValue)} value</div>
          </div>

          {/* Pending actions */}
          {pendingTotal > 0 && (
            <div className="border-t pt-3">
              <span className="text-xs text-muted-foreground">Requires attention</span>
              <div className="mt-1.5 space-y-1">
                {pendingDisputes > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-amber-700">Disputes</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-200 text-amber-700 bg-amber-50/60">
                      {pendingDisputes}
                    </Badge>
                  </div>
                )}
                {pendingPayments > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-blue-700">Pending payments</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-200 text-blue-700 bg-blue-50/60">
                      {pendingPayments}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {pendingTotal === 0 && todayCount === 0 && (
            <div className="border-t pt-3 text-center">
              <p className="text-xs text-muted-foreground">No transactions recorded today</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
