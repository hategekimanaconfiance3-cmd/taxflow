"use client";

import { useEffect, useState } from "react";
import type { ProvinceTaxData } from "@/app/api/admin/province-tax/route";
import { formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeoCardSkeleton } from "@/components/admin/loading-skeletons";
import { MapPin, Inbox } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

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
      {payload.map((point) => (
        <div key={point.name} className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{point.name}</span>
          <span className="font-medium">{formatCompact(point.value ?? 0)} RWF</span>
        </div>
      ))}
    </div>
  );
}

export function ProvinceTaxMap() {
  const [data, setData] = useState<ProvinceTaxData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/province-tax")
      .then((response) => response.ok ? response.json() as Promise<ProvinceTaxData> : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <GeoCardSkeleton />;

  if (!data || data.provinces.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 gap-2">
          <Inbox className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No province data is available from the taxpayer registry.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Taxpayer Activity by Province
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Net VAT reported and confirmed tax payments, grouped by the TIN registry location
            </p>
          </div>
          {data.leadingProvince && (
            <span className="text-[10px] text-muted-foreground border rounded px-2 py-0.5">
              Highest reported VAT: {data.leadingProvince}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Net VAT reported</p>
            <p className="text-sm font-semibold">{formatCompact(data.totalVatReported)} RWF</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Confirmed tax payments</p>
            <p className="text-sm font-semibold">{formatCompact(data.totalConfirmedTaxPayments)} RWF</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Traders with location</p>
            <p className="text-sm font-semibold">{data.provinces.reduce((sum, item) => sum + item.traderCount, 0).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Location not available</p>
            <p className="text-sm font-semibold">{data.tradersWithoutProvince.toLocaleString()}</p>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.provinces} margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="province" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value: number) => formatCompact(value)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={68} />
              <Tooltip content={<ProvinceTooltip />} />
              <Bar dataKey="vatReported" name="Net VAT reported" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="confirmedTaxPayments" name="Confirmed tax payments" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.provinces.map((province) => (
            <div key={province.province} className="rounded-lg border px-3 py-2.5">
              <p className="text-xs font-semibold">{province.province}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {province.traderCount} traders · {province.transactionCount} recorded transactions
              </p>
              <p className="text-[10px] text-muted-foreground">
                Average transaction: {formatCompact(province.averageTransactionValue)} RWF
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
