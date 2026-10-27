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
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/lib/socket-client';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { Activity, Zap, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type PulsePoint = { minute: string; value: number; count: number };

function buildPulse(raw: PulsePoint[]): PulsePoint[] {
  if (raw.length === 60) return raw;
  // Ensure we always have 60 points; fill missing minutes with 0
  const now = new Date();
  const map = new Map(raw.map((r) => [r.minute, r]));
  return Array.from({ length: 60 }, (_, i) => {
    const ts = new Date(now.getTime() - (59 - i) * 60 * 1000);
    const label = ts.toTimeString().slice(0, 5);
    return map.get(label) ?? { minute: label, value: 0, count: 0 };
  });
}

function velocityColor(pct: number): string {
  if (pct >= 90) return '#10b981'; // green
  if (pct >= 50) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

interface CommandCenterHeroProps {
  userId: string;
  todayCount: number;
  todayValue: number;
  weekCount: number;
  weekValue: number;
  insight?: string;
}

export function CommandCenterHero({
  userId,
  todayCount,
  todayValue,
  weekCount,
  weekValue,
  insight,
}: CommandCenterHeroProps) {
  const [pulse, setPulse] = useState<PulsePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastPulse, setLastPulse] = useState<number | null>(null);
  const fetchRef = useRef(false);

  const fetchPulse = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ebm-pulse');
      if (!res.ok) return;
      const data: PulsePoint[] = await res.json();
      setPulse(buildPulse(data));
      setLastPulse(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    fetchPulse();
  }, [fetchPulse]);

  // Real-time: on new transaction, append to current minute bucket and refetch
  const { connected } = useSocket(userId, {
    'txn:incoming': () => {
      // Append a synthetic point to the current minute, then refetch for accuracy
      setPulse((prev) => {
        if (!prev.length) return prev;
        const now = new Date().toTimeString().slice(0, 5);
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (next[lastIdx].minute === now) {
          next[lastIdx] = {
            ...next[lastIdx],
            count: next[lastIdx].count + 1,
          };
        }
        return next;
      });
      // Refetch for accurate values
      fetchPulse();
    },
    'txn:confirmed': () => fetchPulse(),
  });

  // Compute velocity: RWF/min based on last 5 minutes vs daily average
  const last5 = pulse.slice(-5);
  const last5Value = last5.reduce((s, p) => s + p.value, 0);
  const velocityNow = last5.length > 0 ? last5Value / last5.length : 0;
  const noActivityLastHour = pulse.length > 0 && pulse.every((p) => p.value === 0 && p.count === 0);

  // Daily average: if today has transactions, compute avg per minute since midnight
  const minutesSinceMidnight = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() || 1;
  })();
  const dailyAvgVelocity = todayValue > 0 ? todayValue / minutesSinceMidnight : 0;
  const velocityPct = dailyAvgVelocity > 0
    ? Math.min(Math.round((velocityNow / dailyAvgVelocity) * 100), 150)
    : 0;
  const gaugeColor = velocityColor(velocityPct);

  const gaugeData = [{ name: 'velocity', value: Math.min(velocityPct, 100), fill: gaugeColor }];

  // Custom tooltip
  const PulseTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-md border bg-background px-3 py-2 shadow-md text-xs">
        <p className="font-medium">{label}</p>
        <p className="text-emerald-600 font-mono">{formatRWF(payload[0]?.value ?? 0)}</p>
      </div>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ── Live Transaction Flow — 2/3 width ── */}
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

      {/* ── Collection Velocity Gauge — 1/3 width ── */}
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Collection Velocity
          </CardTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">RWF / minute vs daily avg</p>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center pb-3 pt-1">
          {/* Radial gauge */}
          <div className="relative">
            <ResponsiveContainer width={160} height={120}>
              <RadialBarChart
                innerRadius="55%"
                outerRadius="85%"
                data={gaugeData}
                startAngle={200}
                endAngle={-20}
                barSize={14}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={6}
                  background={{ fill: 'hsl(var(--muted))' }}
                  isAnimationActive={true}
                  animationDuration={600}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-2xl font-bold leading-none"
                style={{ color: gaugeColor }}
              >
                {Math.min(velocityPct, 150)}%
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                {velocityPct >= 90 ? 'On Track' : velocityPct >= 50 ? 'Below Avg' : 'Low'}
              </span>
            </div>
          </div>

          {/* Stats below gauge */}
          <div className="w-full space-y-1.5 mt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Now (5-min avg)</span>
              <span className={cn('font-mono font-semibold', { 'text-emerald-600': velocityPct >= 90, 'text-amber-600': velocityPct >= 50 && velocityPct < 90, 'text-red-500': velocityPct < 50 })}>
                {velocityNow === 0 ? '0 RWF/min' : `${formatRWF(Math.round(velocityNow))}/min`}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Daily avg (baseline)</span>
              <span className="font-mono text-muted-foreground">
                {dailyAvgVelocity === 0 ? 'No data' : `${formatRWF(Math.round(dailyAvgVelocity))}/min`}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">vs daily avg</span>
              <span className={cn('font-mono text-xs font-semibold', { 'text-emerald-600': velocityPct >= 90, 'text-amber-600': velocityPct >= 50 && velocityPct < 90, 'text-red-500': velocityPct < 50 })}>
                {dailyAvgVelocity === 0 ? 'No baseline' : `${Math.min(velocityPct, 150)}% of daily avg`}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">This week</span>
              <span className="font-mono text-muted-foreground">{weekCount.toLocaleString()} txn</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
