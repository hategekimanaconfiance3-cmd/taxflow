"use client";

import { useEffect, useState } from "react";
import type { ProvinceTaxData, ProvincePoint } from "@/app/api/admin/province-tax/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GeoCardSkeleton } from "@/components/admin/loading-skeletons";
import {
  MapPin,
  Trophy,
  TrendingDown,
  Users,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Inbox,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Province Tax Distribution — replaces Supply Chain Summary in Analytics
// ---------------------------------------------------------------------------

const PROVINCE_COLORS = [
  "#6366f1", // Kigali City — indigo
  "#3b82f6", // Northern — blue
  "#10b981", // Southern — emerald
  "#f59e0b", // Eastern — amber
  "#ec4899", // Western — pink
];

const ROLE_LABELS: Record<string, string> = {
  manufacturer: "Manufacturing",
  wholesaler: "Wholesale",
  retailer: "Retail",
};

interface TooltipArgs {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
}

function ProvinceTooltip({ active, payload, label }: TooltipArgs) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-lg px-3 py-2.5 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-medium">{formatCompact(p.value ?? 0)} RWF</span>
        </div>
      ))}
    </div>
  );
}

function CollectionBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${rate}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-semibold tabular-nums w-8 text-right">{rate}%</span>
    </div>
  );
}

function ProvinceCard({
  province,
  color,
  selected,
  onClick,
}: {
  province: ProvincePoint;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  const statusIcon =
    province.collectionRate >= 80 ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
    ) : province.collectionRate >= 50 ? (
      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
    ) : (
      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
    );

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-3 transition-all",
        selected
          ? "border-2 shadow-sm"
          : "border hover:border-muted-foreground/30 hover:bg-muted/30",
      )}
      style={selected ? { borderColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-0.5" style={{ background: color }} />
          <p className="text-xs font-semibold leading-tight truncate">{province.province}</p>
        </div>
        {statusIcon}
      </div>
      <p className="text-base font-bold tracking-tight">{formatCompact(province.vatOwed)} RWF</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">VAT obligations</p>
      <CollectionBar rate={province.collectionRate} color={color} />
      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <Users className="h-2.5 w-2.5" />
          {province.traderCount}
        </span>
        <span className="flex items-center gap-0.5">
          <ArrowLeftRight className="h-2.5 w-2.5" />
          {province.txnCount}
        </span>
        {province.topRole && (
          <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">
            {ROLE_LABELS[province.topRole] ?? province.topRole}
          </Badge>
        )}
      </div>
    </button>
  );
}

export function ProvinceTaxMap(_props: { from?: string; to?: string } = {}) {
  const [data, setData] = useState<ProvinceTaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/province-tax")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProvinceTaxData | null) => {
        setData(d);
        if (d?.provinces[0]) setSelected(d.provinces[0].province);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <GeoCardSkeleton />;

  if (!data || data.provinces.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 gap-2">
          <Inbox className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No province data available</p>
        </CardContent>
      </Card>
    );
  }

  const selectedProvince = data.provinces.find((p) => p.province === selected) ?? data.provinces[0];
  const colorMap = Object.fromEntries(
    data.provinces.map((p, i) => [p.province, PROVINCE_COLORS[i % PROVINCE_COLORS.length]]),
  );

  // Chart data with both vatOwed and vatCollected
  const chartData = data.provinces.map((p) => ({
    name: p.province.replace(" Province", "").replace(" City", ""),
    "VAT Owed": p.vatOwed,
    "VAT Collected": p.vatCollected,
  }));

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Tax Distribution by Province
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              VAT obligations vs collected · click a province to inspect
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {data.bestProvince && (
              <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <Trophy className="h-3 w-3" />
                <span className="font-medium">{data.bestProvince.replace(" Province", "")}</span>
              </div>
            )}
            {data.worstProvince && data.worstProvince !== data.bestProvince && (
              <div className="flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                <TrendingDown className="h-3 w-3" />
                <span className="font-medium">{data.worstProvince.replace(" Province", "")}</span>
              </div>
            )}
            <span className="text-muted-foreground/60 font-mono text-[10px]">
              {data.nationalCollectionRate}% national rate
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Grouped bar chart */}
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 16, bottom: 0, left: 16 }}
              barCategoryGap="30%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatCompact(v)}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip content={<ProvinceTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
              <Bar dataKey="VAT Owed" radius={[3, 3, 0, 0]}>
                {data.provinces.map((p, i) => (
                  <Cell
                    key={p.province}
                    fill={colorMap[p.province]}
                    opacity={selected === p.province ? 1 : 0.6}
                    onClick={() => setSelected(p.province)}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Bar>
              <Bar dataKey="VAT Collected" radius={[3, 3, 0, 0]}>
                {data.provinces.map((p) => (
                  <Cell
                    key={p.province}
                    fill={colorMap[p.province]}
                    fillOpacity={selected === p.province ? 0.5 : 0.25}
                    onClick={() => setSelected(p.province)}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Province cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {data.provinces.map((p) => (
            <ProvinceCard
              key={p.province}
              province={p}
              color={colorMap[p.province]}
              selected={selected === p.province}
              onClick={() => setSelected(selected === p.province ? null : p.province)}
            />
          ))}
        </div>

        {/* Selected province detail panel */}
        {selectedProvince && (
          <div
            className="rounded-xl border p-4 space-y-3 transition-all"
            style={{ borderColor: colorMap[selectedProvince.province] + "60" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: colorMap[selectedProvince.province] }}
                />
                <p className="text-sm font-semibold">{selectedProvince.province}</p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  selectedProvince.collectionRate >= 80
                    ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                    : selectedProvince.collectionRate >= 50
                    ? "border-amber-200 text-amber-700 bg-amber-50"
                    : "border-red-200 text-red-700 bg-red-50",
                )}
              >
                {selectedProvince.collectionRate}% collected
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">VAT Owed</p>
                <p className="font-bold text-sm mt-0.5">{formatCompact(selectedProvince.vatOwed)} RWF</p>
              </div>
              <div>
                <p className="text-muted-foreground">VAT Collected</p>
                <p className="font-bold text-sm mt-0.5">{formatCompact(selectedProvince.vatCollected)} RWF</p>
              </div>
              <div>
                <p className="text-muted-foreground">Outstanding</p>
                <p className="font-bold text-sm mt-0.5 text-red-600">
                  {formatCompact(Math.max(0, selectedProvince.vatOwed - selectedProvince.vatCollected))} RWF
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Avg Txn Value</p>
                <p className="font-bold text-sm mt-0.5">{formatCompact(selectedProvince.avgTxnValue)} RWF</p>
              </div>
            </div>
            <CollectionBar rate={selectedProvince.collectionRate} color={colorMap[selectedProvince.province]} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
