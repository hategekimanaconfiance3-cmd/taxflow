"use client";

import { useState, useTransition, useCallback, useId, type FormEvent } from "react";
import Link from "next/link";
import {
    Search,
    Loader2,
    ChevronDown,
    ChevronUp,
    X,
    Users,
    ExternalLink,
    AlertCircle,
    Filter,
    SlidersHorizontal,
    CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    type TaxpayerSearchFilters,
    validateSearchFilters,
} from "@/lib/taxpayer-search-filters";
import {
    searchTaxpayers,
    type TaxpayerSearchResult,
    type TaxpayerSearchRow,
} from "@/lib/actions/taxpayer-search.action";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_OPTIONS = [
    { value: "", label: "All roles" },
    { value: "manufacturer", label: "Manufacturer" },
    { value: "wholesaler", label: "Wholesaler" },
    { value: "retailer", label: "Retailer" },
] as const;

const BUSINESS_TYPE_OPTIONS = [
    { value: "", label: "All account types" },
    { value: "registered_business", label: "Registered Business" },
    { value: "institution", label: "Institution" },
    { value: "government", label: "Government" },
    { value: "large_bulk_buyer", label: "Large Bulk Buyer" },
] as const;

const STATUS_OPTIONS = [
    { value: "", label: "All statuses" },
    { value: "approved", label: "Approved" },
    { value: "pending", label: "Pending" },
    { value: "under_review", label: "Under Review" },
    { value: "suspended", label: "Suspended" },
] as const;

const EMPTY_FILTERS: TaxpayerSearchFilters = {
    query: "",
    role: "",
    businessType: "",
    clearanceStatus: "",
    dateFrom: "",
    dateTo: "",
};

// ---------------------------------------------------------------------------
// Inline NativeSelect — native <select> styled to match shadcn Input
// ---------------------------------------------------------------------------

function NativeSelect({
    id,
    value,
    onChange,
    options,
    "aria-label": ariaLabel,
}: {
    id?: string;
    value: string;
    onChange: (v: string) => void;
    options: readonly { value: string; label: string }[];
    "aria-label"?: string;
}) {
    return (
        <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={ariaLabel}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string | null }) {
    const cfg: Record<string, string> = {
        manufacturer: "bg-blue-500/10 text-blue-700 border-blue-200",
        wholesaler: "bg-amber-500/10 text-amber-700 border-amber-200",
        retailer: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    };
    return (
        <Badge
            variant="outline"
            className={`capitalize text-[10px] ${cfg[role ?? ""] ?? "bg-muted text-muted-foreground"}`}
        >
            {role ?? "—"}
        </Badge>
    );
}

function StatusBadge({ status }: { status: string | null }) {
    const cfg: Record<string, string> = {
        approved: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
        pending: "bg-amber-500/10 text-amber-700 border-amber-200",
        under_review: "bg-orange-500/10 text-orange-700 border-orange-200",
        suspended: "bg-red-500/10 text-red-700 border-red-200",
    };
    return (
        <Badge
            variant="outline"
            className={`capitalize text-[10px] ${cfg[status ?? ""] ?? "bg-muted text-muted-foreground"}`}
        >
            {status?.replace(/_/g, " ") ?? "—"}
        </Badge>
    );
}

// ---------------------------------------------------------------------------
// Active filter chip
// ---------------------------------------------------------------------------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border bg-primary/5 text-primary px-2.5 py-0.5 text-xs font-medium">
            {label}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label} filter`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/10 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Section toggle — accessible collapsible for advanced filter groups
// ---------------------------------------------------------------------------

function FilterSection({
    title,
    children,
    defaultOpen = false,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const id = useId();
    return (
        <div className="border rounded-md overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={id}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
            >
                {title}
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {open && (
                <div id={id} className="border-t bg-muted/10 px-4 py-4">
                    {children}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
    page,
    totalPages,
    totalRows,
    pageSize,
    isPending,
    onPage,
}: {
    page: number;
    totalPages: number;
    totalRows: number;
    pageSize: number;
    isPending: boolean;
    onPage: (p: number) => void;
}) {
    if (totalPages <= 1) return null;
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalRows);

    const delta = 2;
    const pages: number[] = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
        pages.push(i);
    }

    return (
        <div className="flex items-center justify-between border-t pt-4 mt-4">
            <p className="text-xs text-muted-foreground">
                Showing {start}–{end} of {totalRows} traders
            </p>
            <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
                <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page <= 1 || isPending}
                    onClick={() => onPage(page - 1)}
                    aria-label="Previous page"
                >
                    ‹
                </Button>
                {pages[0] > 1 && (
                    <>
                        <Button variant="outline" size="icon" className="h-7 w-7 text-xs" onClick={() => onPage(1)} disabled={isPending}>1</Button>
                        {pages[0] > 2 && <span className="px-1 text-muted-foreground text-xs" aria-hidden>…</span>}
                    </>
                )}
                {pages.map((p) => (
                    <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="icon"
                        className="h-7 w-7 text-xs"
                        disabled={isPending}
                        onClick={() => onPage(p)}
                        aria-label={`Page ${p}`}
                        aria-current={p === page ? "page" : undefined}
                    >
                        {p}
                    </Button>
                ))}
                {pages[pages.length - 1] < totalPages && (
                    <>
                        {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-muted-foreground text-xs" aria-hidden>…</span>}
                        <Button variant="outline" size="icon" className="h-7 w-7 text-xs" onClick={() => onPage(totalPages)} disabled={isPending}>{totalPages}</Button>
                    </>
                )}
                <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page >= totalPages || isPending}
                    onClick={() => onPage(page + 1)}
                    aria-label="Next page"
                >
                    ›
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Results table skeleton
// ---------------------------------------------------------------------------

function ResultsSkeleton() {
    return (
        <div className="space-y-2" aria-busy="true" aria-label="Loading results">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-muted/40 animate-pulse" />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function ResultsTable({
    rows,
    isPending,
}: {
    rows: TaxpayerSearchRow[];
    isPending: boolean;
}) {
    return (
        <div className={isPending ? "opacity-60 pointer-events-none" : ""} aria-busy={isPending}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[120px]">TIN</TableHead>
                        <TableHead>Business / Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Account Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {row.tinNumber ?? "—"}
                            </TableCell>
                            <TableCell>
                                <p className="font-medium text-sm">{row.businessName ?? row.name}</p>
                                {row.businessName && (
                                    <p className="text-xs text-muted-foreground">{row.name}</p>
                                )}
                            </TableCell>
                            <TableCell><RoleBadge role={row.role} /></TableCell>
                            <TableCell>
                                <span className="text-xs text-muted-foreground capitalize">
                                    {row.businessType?.replace(/_/g, " ") ?? "—"}
                                </span>
                            </TableCell>
                            <TableCell><StatusBadge status={row.clearanceStatus} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                                {new Date(row.createdAt).toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    timeZone: "Africa/Kigali",
                                })}
                            </TableCell>
                            <TableCell className="text-right">
                                <Link href={`/admin/traders/${row.id}`}>
                                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                                        <ExternalLink className="h-3 w-3" aria-hidden />
                                        View
                                    </Button>
                                </Link>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TaxpayerIntelligenceSearch() {
    const [filters, setFilters] = useState<TaxpayerSearchFilters>(EMPTY_FILTERS);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [result, setResult] = useState<TaxpayerSearchResult | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [error, setError] = useState<string>("");
    const [dateError, setDateError] = useState<string>("");
    const [isPending, startTransition] = useTransition();

    // ----- helpers -----

    function setFilter<K extends keyof TaxpayerSearchFilters>(key: K, value: TaxpayerSearchFilters[K]) {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }

    const runSearch = useCallback(
        (page = 1) => {
            // Client-side date validation before server round-trip
            const validationError = validateSearchFilters(filters);
            if (validationError) {
                setDateError(validationError);
                return;
            }
            setDateError("");
            setError("");
            setHasSearched(true);
            startTransition(async () => {
                try {
                    const data = await searchTaxpayers(filters, page);
                    setResult(data);
                    setError("");
                } catch (err) {
                    setResult(null);
                    setError(
                        err instanceof Error && err.message.length < 200
                            ? err.message
                            : "Search failed. Please try again or contact support.",
                    );
                }
            });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filters],
    );

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        runSearch(1);
    }

    function resetFilters() {
        setFilters(EMPTY_FILTERS);
        setResult(null);
        setHasSearched(false);
        setError("");
        setDateError("");
    }

    // ----- active filter chips -----

    const chips: { label: string; clear: () => void }[] = [];
    if (filters.role) {
        const label = ROLE_OPTIONS.find((o) => o.value === filters.role)?.label ?? filters.role;
        chips.push({ label: `Role: ${label}`, clear: () => setFilter("role", "") });
    }
    if (filters.businessType) {
        const label = BUSINESS_TYPE_OPTIONS.find((o) => o.value === filters.businessType)?.label ?? filters.businessType;
        chips.push({ label: `Type: ${label}`, clear: () => setFilter("businessType", "") });
    }
    if (filters.clearanceStatus) {
        const label = STATUS_OPTIONS.find((o) => o.value === filters.clearanceStatus)?.label ?? filters.clearanceStatus;
        chips.push({ label: `Status: ${label}`, clear: () => setFilter("clearanceStatus", "") });
    }
    if (filters.dateFrom) chips.push({ label: `From: ${filters.dateFrom}`, clear: () => { setFilter("dateFrom", ""); setDateError(""); } });
    if (filters.dateTo) chips.push({ label: `To: ${filters.dateTo}`, clear: () => { setFilter("dateTo", ""); setDateError(""); } });

    const hasActiveFilters = chips.length > 0;

    return (
        <div className="space-y-5">
            {/* ── Page header ── */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Users className="h-6 w-6 text-primary" aria-hidden />
                    Taxpayer Intelligence Search
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Search registered traders using records scoped to your authorised RRA role.
                </p>
            </div>

            {/* ── Search form ── */}
            <Card>
                <CardContent className="pt-5">
                    <form onSubmit={handleSubmit} noValidate>
                        {/* ── Primary row ── */}
                        <div className="flex flex-wrap gap-3 items-end">
                            {/* Search input */}
                            <div className="flex-[2] min-w-[200px]">
                                <Label htmlFor="ti-query" className="text-xs mb-1.5 block font-medium">
                                    TIN, trader or business name
                                </Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
                                    <Input
                                        id="ti-query"
                                        value={filters.query ?? ""}
                                        onChange={(e) => setFilter("query", e.target.value)}
                                        placeholder="Search by TIN, name, or business…"
                                        className="pl-9"
                                        autoComplete="off"
                                        spellCheck={false}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                runSearch(1);
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Role filter */}
                            <div className="flex-1 min-w-[140px]">
                                <Label htmlFor="ti-role" className="text-xs mb-1.5 block font-medium">
                                    Business role
                                </Label>
                                <NativeSelect
                                    id="ti-role"
                                    value={filters.role ?? ""}
                                    onChange={(v) => setFilter("role", v as TaxpayerSearchFilters["role"])}
                                    options={ROLE_OPTIONS}
                                />
                            </div>

                            {/* Status filter */}
                            <div className="flex-1 min-w-[140px]">
                                <Label htmlFor="ti-status" className="text-xs mb-1.5 block font-medium">
                                    Account status
                                </Label>
                                <NativeSelect
                                    id="ti-status"
                                    value={filters.clearanceStatus ?? ""}
                                    onChange={(v) => setFilter("clearanceStatus", v as TaxpayerSearchFilters["clearanceStatus"])}
                                    options={STATUS_OPTIONS}
                                />
                            </div>

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={isPending}
                                className="h-9 gap-2 min-w-[110px]"
                            >
                                {isPending ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Searching…</>
                                ) : (
                                    <><Search className="h-4 w-4" aria-hidden />Search</>
                                )}
                            </Button>
                        </div>

                        {/* ── Advanced filters toggle ── */}
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={() => setAdvancedOpen((v) => !v)}
                                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:underline"
                                aria-expanded={advancedOpen}
                            >
                                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                                {advancedOpen ? "Hide" : "Show"} advanced filters
                                {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>

                            {/* ── Advanced filter sections ── */}
                            {advancedOpen && (
                                <div className="mt-4 space-y-2">
                                    {/* Section 1: Business Details */}
                                    <FilterSection title="Business Details" defaultOpen>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <Label htmlFor="ti-biz-type" className="text-xs mb-1.5 block font-medium">
                                                    Account type
                                                </Label>
                                                <NativeSelect
                                                    id="ti-biz-type"
                                                    value={filters.businessType ?? ""}
                                                    onChange={(v) => setFilter("businessType", v as TaxpayerSearchFilters["businessType"])}
                                                    options={BUSINESS_TYPE_OPTIONS}
                                                />
                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                    Registered business, institution, government, or large bulk buyer.
                                                </p>
                                            </div>
                                        </div>
                                    </FilterSection>

                                    {/* Section 2: Registration Date Range */}
                                    <FilterSection title="Account Creation Date">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <Label htmlFor="ti-date-from" className="text-xs mb-1.5 block font-medium flex items-center gap-1">
                                                    <CalendarDays className="h-3 w-3" aria-hidden />
                                                    Registered from
                                                </Label>
                                                <Input
                                                    id="ti-date-from"
                                                    type="date"
                                                    value={filters.dateFrom ?? ""}
                                                    onChange={(e) => {
                                                        setFilter("dateFrom", e.target.value);
                                                        setDateError("");
                                                    }}
                                                    max={filters.dateTo || undefined}
                                                    className="h-9 text-sm"
                                                    aria-describedby={dateError ? "date-error" : undefined}
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="ti-date-to" className="text-xs mb-1.5 block font-medium flex items-center gap-1">
                                                    <CalendarDays className="h-3 w-3" aria-hidden />
                                                    Registered to
                                                </Label>
                                                <Input
                                                    id="ti-date-to"
                                                    type="date"
                                                    value={filters.dateTo ?? ""}
                                                    onChange={(e) => {
                                                        setFilter("dateTo", e.target.value);
                                                        setDateError("");
                                                    }}
                                                    min={filters.dateFrom || undefined}
                                                    className="h-9 text-sm"
                                                    aria-describedby={dateError ? "date-error" : undefined}
                                                />
                                            </div>
                                        </div>
                                        {dateError && (
                                            <p id="date-error" role="alert" className="mt-2 text-xs text-destructive flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" aria-hidden />
                                                {dateError}
                                            </p>
                                        )}
                                    </FilterSection>

                                    {/* Section 3: Registered Location — note: not in DB schema */}
                                    <FilterSection title="Registered Location">
                                        <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                                            <p className="font-medium mb-1">Location filters not available</p>
                                            <p>
                                                The trader database does not currently include structured province, district, or sector
                                                fields. Location-based filtering is not connected to real data and has been omitted
                                                to avoid cosmetic filters. Use the text search to search by location name if it appears
                                                in the business name.
                                            </p>
                                        </div>
                                    </FilterSection>
                                </div>
                            )}
                        </div>

                        {/* ── Active filter chips ── */}
                        {hasActiveFilters && (
                            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t">
                                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                                    <Filter className="h-3 w-3" aria-hidden />
                                    Active filters:
                                </span>
                                {chips.map((chip) => (
                                    <FilterChip key={chip.label} label={chip.label} onRemove={chip.clear} />
                                ))}
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-ring rounded"
                                >
                                    Clear all
                                </button>
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>

            {/* ── Pre-search empty state ── */}
            {!hasSearched && (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <Users className="h-10 w-10 mb-3 opacity-20" aria-hidden />
                    <p className="text-sm font-medium">Enter search criteria above and press Search</p>
                    <p className="text-xs mt-1 max-w-xs">
                        Results are scoped to your authorised RRA role. Every search is logged.
                    </p>
                </div>
            )}

            {/* ── Results ── */}
            {hasSearched && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                <Users className="h-4 w-4" aria-hidden />
                                Search Results
                            </span>
                            {result && !isPending && (
                                <span className="text-xs font-normal text-muted-foreground">
                                    {result.totalRows} trader{result.totalRows !== 1 ? "s" : ""} found
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>

                    <Separator />

                    <CardContent className="pt-4">
                        {/* Loading */}
                        {isPending && <ResultsSkeleton />}

                        {/* Error */}
                        {!isPending && error && (
                            <div
                                role="alert"
                                className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                            >
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Empty */}
                        {!isPending && !error && result && result.rows.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                <Users className="h-8 w-8 mb-2 opacity-20" aria-hidden />
                                <p className="text-sm font-medium">No traders match your search</p>
                                <p className="text-xs mt-1">Try adjusting the search terms or filters.</p>
                            </div>
                        )}

                        {/* Results table */}
                        {!isPending && !error && result && result.rows.length > 0 && (
                            <>
                                <ResultsTable rows={result.rows} isPending={isPending} />
                                <Pagination
                                    page={result.page}
                                    totalPages={result.totalPages}
                                    totalRows={result.totalRows}
                                    pageSize={result.pageSize}
                                    isPending={isPending}
                                    onPage={(p) => runSearch(p)}
                                />
                            </>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
