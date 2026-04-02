'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SparkPoint = { d: string; v: number };

interface KpiCardSparklineProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  sparkKey: 'transactions' | 'vatGenerated' | 'vatCollected';
  sparkColor?: string;
  className?: string;
}

type SparklineData = {
  transactions: SparkPoint[];
  vatGenerated: SparkPoint[];
  vatCollected: SparkPoint[];
};

// Module-level cache so all cards share one fetch
let sparklineCache: SparklineData | null = null;
let sparklineFetchPromise: Promise<SparklineData> | null = null;

function getSparklines(): Promise<SparklineData> {
  if (sparklineCache) return Promise.resolve(sparklineCache);
  if (sparklineFetchPromise) return sparklineFetchPromise;
  sparklineFetchPromise = fetch('/api/admin/sparklines')
    .then((r) => r.json())
    .then((data: SparklineData) => {
      sparklineCache = data;
      sparklineFetchPromise = null;
      return data;
    });
  return sparklineFetchPromise;
}

export function KpiCardSparkline({
  title,
  value,
  description,
  trend,
  icon,
  sparkKey,
  sparkColor = '#10b981',
  className,
}: KpiCardSparklineProps) {
  const [sparkData, setSparkData] = useState<SparkPoint[]>([]);

  useEffect(() => {
    getSparklines().then((d) => setSparkData(d[sparkKey] ?? []));
  }, [sparkKey]);

  return (
    <Card className={cn('relative overflow-hidden flex flex-col', className)}>
      <CardHeader className="flex flex-row items-start justify-between pb-1 space-y-0 pt-3 px-3">
        <CardTitle className="text-[11px] font-medium text-muted-foreground leading-tight">{title}</CardTitle>
        {icon && <div className="text-muted-foreground/50 shrink-0">{icon}</div>}
      </CardHeader>
      <CardContent className="pt-0 pb-0 px-3">
        <div className="text-[17px] font-bold truncate leading-tight" title={String(value)}>
          {value}
        </div>
        {description && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{description}</p>
        )}
        {trend && (
          <p className={cn('text-[10px] font-medium mt-0.5', trend.positive ? 'text-emerald-600' : 'text-red-500')}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </p>
        )}
      </CardContent>

      {/* Sparkline at the bottom */}
      {sparkData.length > 0 && (
        <div className="mt-1 h-8 w-full opacity-70">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${sparkKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sparkColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                strokeWidth={1.5}
                fill={`url(#spark-${sparkKey})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
