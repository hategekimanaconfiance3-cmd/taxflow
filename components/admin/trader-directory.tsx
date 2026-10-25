"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { getTraderDirectoryFilterOptions, searchTraderDirectory } from "@/lib/actions/admin-trader-directory.action";
import type { TraderDirectoryFilters } from "@/lib/validation/trader-filter.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DirectoryResponse = Awaited<ReturnType<typeof searchTraderDirectory>>;
type DirectoryRow = DirectoryResponse["rows"][number];
type LocationOptions = { province: string[]; district: string[]; sector: string[]; cell: string[]; village: string[] };
type Capabilities = { location: boolean; transactions: boolean; stock: boolean; production: boolean; risk: boolean };

const initialFilters = (): TraderDirectoryFilters => ({
  query: "", province: "", district: "", sector: "", cell: "", village: "", product: "", relatedTraderTin: "", noActivityDuringPeriod: false, page: 1,
});

const dateLabel = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleDateString() : "—";
const numberLabel = (value: number | undefined) => value === undefined ? "—" : new Intl.NumberFormat().format(value);
const moneyLabel = (value: number | undefined) => value === undefined ? "—" : new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(value);

function setField<K extends keyof TraderDirectoryFilters>(
  setter: React.Dispatch<React.SetStateAction<TraderDirectoryFilters>>,
  key: K,
  value: TraderDirectoryFilters[K],
) {
  setter((current) => ({ ...current, [key]: value, page: 1 }));
}

export function TraderDirectory({ provinces, capabilities, initialLocationError }: { provinces: string[]; capabilities: Capabilities; initialLocationError: string }) {
  const [filters, setFilters] = useState<TraderDirectoryFilters>(initialFilters);
  const [options, setOptions] = useState<LocationOptions>({ province: provinces, district: [], sector: [], cell: [], village: [] });
  const [result, setResult] = useState<DirectoryResponse | null>(null);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState(initialLocationError);
  const [isPending, startTransition] = useTransition();

  function loadOptions(level: keyof LocationOptions, next: Partial<TraderDirectoryFilters>) {
    const dependencies = { ...filters, ...next };
    if (!capabilities.location) return;
    startTransition(async () => {
      try {
        const values = await getTraderDirectoryFilterOptions({
          level,
          ...(dependencies.province ? { province: dependencies.province } : {}),
          ...(dependencies.district ? { district: dependencies.district } : {}),
          ...(dependencies.sector ? { sector: dependencies.sector } : {}),
          ...(dependencies.cell ? { cell: dependencies.cell } : {}),
        });
        setOptions((current) => ({ ...current, [level]: values }));
        if (level === "province") setLocationError("");
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Location filters are unavailable.";
        if (level === "province") setLocationError(message);
        else setError(message);
      }
    });
  }

  function changeLocation(level: keyof LocationOptions, value: string) {
    const cleared: Partial<TraderDirectoryFilters> = level === "province"
      ? { province: value, district: "", sector: "", cell: "", village: "" }
      : level === "district"
        ? { district: value, sector: "", cell: "", village: "" }
        : level === "sector"
          ? { sector: value, cell: "", village: "" }
          : level === "cell"
            ? { cell: value, village: "" }
            : { village: value };
    setFilters((current) => ({ ...current, ...cleared, page: 1 }));
    const child = level === "province" ? "district" : level === "district" ? "sector" : level === "sector" ? "cell" : level === "cell" ? "village" : null;
    if (child && value) loadOptions(child, cleared);
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        setResult(await searchTraderDirectory(filters));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Trader search failed. Please try again.");
      }
    });
  }

  function clear() {
    setFilters(initialFilters());
    setResult(null);
    setError("");
    setOptions({ province: provinces, district: [], sector: [], cell: [], village: [] });
  }

  function setPage(page: number) {
    const next = { ...filters, page };
    setFilters(next);
    startTransition(async () => {
      try { setResult(await searchTraderDirectory(next)); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load this page."); }
    });
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 0;

  return <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4" />Trader Directory</CardTitle>
      <p className="text-sm text-muted-foreground">Filter registered traders using records and modules your RRA role can access.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <form className="space-y-4" onSubmit={apply}>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Find and account</h3>
          {locationError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span>{locationError}</span><Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => loadOptions("province", {})}>Retry</Button></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input value={filters.query ?? ""} onChange={(event) => setField(setFilters, "query", event.target.value)} placeholder="TIN, trader, business name" aria-label="Search traders" />
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filters.businessRole ?? ""} onChange={(event) => setField(setFilters, "businessRole", (event.target.value || undefined) as TraderDirectoryFilters["businessRole"])} aria-label="Business role">
              <option value="">All business roles</option><option value="manufacturer">Manufacturer</option><option value="wholesaler">Wholesaler</option><option value="retailer">Retailer</option>
            </select>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filters.businessType ?? ""} onChange={(event) => setField(setFilters, "businessType", (event.target.value || undefined) as TraderDirectoryFilters["businessType"])} aria-label="Business account type">
              <option value="">All account types</option><option value="registered_business">Registered business</option><option value="institution">Institution</option><option value="government">Government</option><option value="large_bulk_buyer">Large bulk buyer</option>
            </select>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filters.accountStatus ?? ""} onChange={(event) => setField(setFilters, "accountStatus", (event.target.value || undefined) as TraderDirectoryFilters["accountStatus"])} aria-label="Account status">
              <option value="">All account states</option><option value="active">Active account</option><option value="inactive">Inactive account</option>
            </select>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filters.clearanceStatus ?? ""} onChange={(event) => setField(setFilters, "clearanceStatus", (event.target.value || undefined) as TraderDirectoryFilters["clearanceStatus"])} aria-label="TIN clearance status">
              <option value="">All TIN statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="under_review">Under review</option><option value="suspended">Suspended</option>
            </select>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account creation date</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs text-muted-foreground">From<Input type="date" value={filters.registeredFrom ?? ""} onChange={(event) => setField(setFilters, "registeredFrom", event.target.value || undefined)} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">To<Input type="date" value={filters.registeredTo ?? ""} onChange={(event) => setField(setFilters, "registeredTo", event.target.value || undefined)} /></label>
          </div>
        </section>

        {capabilities.location && <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registered location</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(["province", "district", "sector", "cell", "village"] as const).map((level, index) => {
              const parentValue = index === 0 ? true : Boolean(filters[["province", "district", "sector", "cell"][index - 1] as keyof TraderDirectoryFilters]);
              return <select key={level} className="h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-50" value={filters[level] ?? ""} disabled={!parentValue || (level !== "province" && options[level].length === 0)} onChange={(event) => changeLocation(level, event.target.value)} aria-label={level}>
                <option value="">All {level}s</option>{options[level].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>;
            })}
          </div>
        </section>}

        {(capabilities.transactions || capabilities.stock) && <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product and activity</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input value={filters.product ?? ""} onChange={(event) => setField(setFilters, "product", event.target.value)} placeholder="Product or category" aria-label="Product or category" />
            {capabilities.transactions && <Input value={filters.relatedTraderTin ?? ""} onChange={(event) => setField(setFilters, "relatedTraderTin", event.target.value)} placeholder="Connected trader TIN" aria-label="Related trader TIN" />}
            <label className="space-y-1 text-xs text-muted-foreground">Activity from<Input type="date" value={filters.activityFrom ?? ""} onChange={(event) => setField(setFilters, "activityFrom", event.target.value || undefined)} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">From time (UTC)<Input type="time" value={filters.activityFromTime ?? ""} onChange={(event) => setField(setFilters, "activityFromTime", event.target.value || undefined)} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Activity to<Input type="date" value={filters.activityTo ?? ""} onChange={(event) => setField(setFilters, "activityTo", event.target.value || undefined)} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">To time (UTC)<Input type="time" value={filters.activityToTime ?? ""} onChange={(event) => setField(setFilters, "activityToTime", event.target.value || undefined)} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.noActivityDuringPeriod ?? false} onChange={(event) => setField(setFilters, "noActivityDuringPeriod", event.target.checked)} />No recorded activity during this date range</label>
          <p className="text-xs text-muted-foreground">Products match recorded sales, stock, and/or production records available to your role. A connected trader filter uses recorded transactions. Date and time boundaries use UTC.</p>
          {capabilities.transactions && <div className="space-y-2"><p className="text-xs text-muted-foreground">Lifetime transaction measures</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(["minTransactions", "maxTransactions", "minSalesVolume", "maxSalesVolume", "minPurchaseVolume", "maxPurchaseVolume"] as const).map((field) => <label key={field} className="space-y-1 text-xs text-muted-foreground">{{
              minTransactions: "Minimum transactions", maxTransactions: "Maximum transactions", minSalesVolume: "Minimum sales (RWF)", maxSalesVolume: "Maximum sales (RWF)", minPurchaseVolume: "Minimum purchases (RWF)", maxPurchaseVolume: "Maximum purchases (RWF)",
            }[field]}<Input type="number" min="0" step="1" value={filters[field] ?? ""} onChange={(event) => setField(setFilters, field, event.target.value === "" ? undefined : Number(event.target.value))} /></label>)}
          </div></div>}
          {capabilities.stock && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs text-muted-foreground">Minimum quantity for one matching product<Input type="number" min="0" step="any" value={filters.minStockQuantity ?? ""} onChange={(event) => setField(setFilters, "minStockQuantity", event.target.value === "" ? undefined : Number(event.target.value))} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Maximum quantity for one matching product<Input type="number" min="0" step="any" value={filters.maxStockQuantity ?? ""} onChange={(event) => setField(setFilters, "maxStockQuantity", event.target.value === "" ? undefined : Number(event.target.value))} /></label>
            <p className="self-end text-xs text-muted-foreground">Stock thresholds require a product search that matches exactly one product.</p>
          </div>}
        </section>}

        {capabilities.risk && <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk indicator</h3>
          <select className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:max-w-xs" value={filters.riskLevel ?? ""} onChange={(event) => setField(setFilters, "riskLevel", (event.target.value || undefined) as TraderDirectoryFilters["riskLevel"])} aria-label="Risk level">
            <option value="">Any recorded risk level</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </select>
          <p className="text-xs text-muted-foreground">Risk indicators are review signals, not official findings.</p>
        </section>}

        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={isPending} className="gap-2">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Apply filters</Button><Button type="button" variant="outline" onClick={clear} disabled={isPending} className="gap-2"><X className="h-4 w-4" />Clear filters</Button></div>
      </form>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {result && <div className="space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Showing {numberLabel(result.total)} matching traders</p><p className="text-xs text-muted-foreground">Page {result.page} of {totalPages}</p></div>
        {result.rows.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No traders match all selected filters.</p> : <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3">Trader</th><th className="p-3">TIN</th><th className="p-3">Business role &amp; type</th>{capabilities.location && <th className="p-3">Location</th>}<th className="p-3">Status</th><th className="p-3">Account created</th>{capabilities.transactions && <th className="p-3">Sales / purchases / transactions</th>}{capabilities.stock && <th className="p-3">Stock by product</th>}{capabilities.production && <th className="p-3">Production</th>}<th className="p-3">Last activity</th>{capabilities.risk && <th className="p-3">Risk signal</th>}<th className="p-3">Record</th></tr></thead>
          <tbody className="divide-y">{result.rows.map((row: DirectoryRow) => <tr key={row.id}>
            <td className="p-3"><span className="font-medium">{row.businessName ?? row.name}</span><span className="block text-xs text-muted-foreground">{row.name}</span></td>
            <td className="p-3 font-mono text-xs">{row.tinNumber ?? "—"}</td><td className="p-3 capitalize">{row.businessRole}<span className="block text-xs text-muted-foreground">{row.businessType.replaceAll("_", " ")}</span></td>
            {capabilities.location && <td className="p-3 text-xs text-muted-foreground">{row.location ? [row.location.district, row.location.province].filter(Boolean).join(", ") : "—"}</td>}
            <td className="p-3"><Badge variant={row.accountActive ? "secondary" : "outline"}>{row.accountActive ? "Account active" : "Account inactive"}</Badge><span className="mt-1 block text-xs capitalize text-muted-foreground">TIN {row.clearanceStatus.replaceAll("_", " ")}</span></td>
            <td className="p-3 text-xs">{dateLabel(row.accountCreatedAt)}</td>
            {capabilities.transactions && <td className="p-3 text-xs">Sales {moneyLabel(row.salesVolume)}<span className="block text-muted-foreground">Purchases {moneyLabel(row.purchaseVolume)}</span><span className="block text-muted-foreground">{numberLabel(row.transactionCount)} transactions</span></td>}
            {capabilities.stock && <td className="p-3 text-xs">{row.stockSummary?.length ? <>{row.stockSummary.slice(0, 3).map((item) => <span key={`${item.productName}-${item.unit}`} className="block">{item.productName}: {numberLabel(item.quantity)} {item.unit}</span>)}{row.stockSummary.length > 3 && <span className="text-muted-foreground">and {row.stockSummary.length - 3} more</span>}</> : "—"}</td>}
            {capabilities.production && <td className="p-3 text-xs">{numberLabel(row.productionBatchCount)} batches<span className="block text-muted-foreground">{numberLabel(row.productionQuantity)} units</span></td>}
            <td className="p-3 text-xs">{dateLabel(row.lastActivityAt)}</td>
            {capabilities.risk && <td className="p-3">{row.riskLevel ? <Badge variant="outline" className="capitalize">{row.riskLevel}</Badge> : "—"}</td>}
            <td className="p-3"><Button asChild size="sm" variant="outline"><Link href={`/admin/traders/${row.id}`}>Open</Link></Button></td>
          </tr>)}</tbody>
        </table></div>}
        {result.total > result.pageSize && <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={isPending || result.page <= 1} onClick={() => setPage(result.page - 1)}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={isPending || result.page >= totalPages} onClick={() => setPage(result.page + 1)}>Next</Button></div>}
      </div>}
    </CardContent>
  </Card>;
}
