"use client";

import { useEffect, useState } from "react";
import type { AnomalyTimelineData } from "@/app/api/ai/anomaly-timeline/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { ChartCardSkeleton } from "@/components/admin/loading-skeletons";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function AnomalyTimeline() {
  const [data, setData] = useState<AnomalyTimelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/anomaly-timeline")
      .then((response) => (response.ok ? response.json() as Promise<AnomalyTimelineData> : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ChartCardSkeleton metrics={2} chartHeight="h-48" />;
  if (!data) return <p className="text-sm text-muted-foreground">Anomaly timeline could not be loaded.</p>;
  const TrendIcon = data.trend === "up" ? TrendingUp : data.trend === "down" ? TrendingDown : Minus;
  const trendLabel = data.trend === "up" ? "Increasing" : data.trend === "down" ? "Decreasing" : "Stable";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4 text-muted-foreground" />Audit and suspicious activity events<span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground"><TrendIcon className="h-3.5 w-3.5" />{trendLabel}</span></CardTitle>
        <p className="text-xs text-muted-foreground">Events recorded in the audit log during the last 30 days; these are signals for human review.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border px-3 py-2"><p className="text-[10px] uppercase text-muted-foreground">Recorded events</p><p className="text-xl font-bold">{data.totalAnomalies}</p></div>
        {data.timeline.length ? (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="suspiciousCount" name="Suspicious flags" stackId="events" stroke="#ef4444" fill="#ef444433" />
                <Area type="monotone" dataKey="auditCount" name="Audit opened" stackId="events" stroke="#3b82f6" fill="#3b82f633" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="rounded-lg border bg-muted/20 py-8 text-center text-sm text-muted-foreground">No matching audit events were recorded in this period.</p>}
      </CardContent>
    </Card>
  );
}
