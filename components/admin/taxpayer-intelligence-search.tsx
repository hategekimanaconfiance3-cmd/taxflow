"use client";

import { useState, useTransition, useCallback, type FormEvent } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    searchTaxpayers,
    type TaxpayerSearchFilters,
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

const STATUS_OPTIONS = [
    { value: "", label: "All statuses" },
    { value: "approved", label: "Approved" },
    { value: "pending", label: "Pending" },
    { value: "under_review", label: "Under Review" },
    { value: "suspended", label: "Suspended" },
] as const;

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function roleBadge(role: string | null) {
    const cfg: Record<string, string> = {
        manufacturer: "bg-blue-500/10 text-blue-700 border-blue-200",
        wholesaler: "bg-amber-500/10 text-amber-700 border-amber-200",
        retailer: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
    };
    return (
        <Badge variant="outline" className={`capitalize text-[10px] ${cfg[role ?? ""] ?? "bg-muted text-muted-foreground"}`}>
            {role ?? "—"}
        </Badge>
    );
}

function statusBadge(status: string | null) {
    const cfg: Record<string, string> = {
        approved: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
        pending: "bg-amber-500/10 text-amber-700 border-amber-200",
        under_review: "bg-orange-500/10 text-orange-700 border-orange-200",
        suspended: "bg-red-500/10 text-red-700 border-red-200",
    };
    return (
        <Badge variant="outline" className={`capitalize text-[10px] ${cfg[status ?? ""] ?? "bg-muted text-muted-foreground"}`}>
            {status?.replace("_", " ") ?? "—"}
        </Badge>
    );
}

// ---------------------------------------------------------------------------
// Active filter chip
// ---------------------------------------------------------------------------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-0.5 text-xs font-medium">
            {label}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label} filter`}
                className="ml-0.5 rounded-full hover:bg-muted transition-colors"
            >
                <X className="h-3 w-3" />
            </button>
        </span>
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

    // Build visible page numbers
    const pages: number[] = [];
    const delta = 2;
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
        pages.push(i);
    }

    return (
        <div className="flex items-center justify-between border-t pt-4 mt-4">
            <p className="text-xs text-muted-foreground">
                Showing {start}–{end} of {totalRows} traders
            </p>
            <div className="flex items-center gap-1">
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
                        {pages[0] > 2 && <span className="px-1 text-muted-foreground text-xs">…</span>}
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
                    >
                        {p}
                    </Button>
                ))}
                {pages[pages.length - 1] < totalPages && (
                    <>
                        {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-muted-foreground text-xs">…</span>}
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
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[120px]">TIN</TableHead>
                    <TableHead>Business / Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => (
                    <TableRow key={row.id} className={isPending ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.tinNumber ?? "—"}
                        </TableCell>
                        <TableCell>
                            <p className="font-medium text-sm">{row.businessName ?? row.name}</p>
                            {row.businessName && (
                                <p className="text-xs text-muted-foreground">{row.name}</p>
                            )}
                        </TableCell>
                        <TableCell>{roleBadge(row.role)}</TableCell>
                        <TableCell>{statusBadge(row.clearanceStatus)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                            {new Date(row.createdAt).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                            })}
                        </TableCell>
                        <TableCell className="text-right">
                            <Link href={`/admin/traders/${row.id}`}>
                                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                                    <ExternalLink className="h-3 w-3" />
                                    View
                                </Button>
                            </Link>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const EMPTY_FILTERS: TaxpayerSearchFilters = {
    query: "",
    role: "",
    clearanceStatus: "",
    dateFrom: "",
    dateTo: "",
};

export function TaxpayerIntelligenceSearch() {
    const [filters, setFilters] = useState<TaxpayerSearchFilters>(EMPTY_FILTERS);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [result, setResult] = useState<TaxpayerSearchResult | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [error, setError] = useState<string>("");
    const [dateError, setDateError] = useState<string>("");
    const [isPending, startTransition] = useTransition();

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function setFilter<K extends keyof TaxpayerSearchFilters>(key: K, value: TaxpayerSearchFilters[K]) {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }

    function validateDates(): boolean {
        if (filters.dateFrom && filters.dateTo && filters.dateTo < filters.dateFrom) {
            setDateError("'To' date must be on or after the 'From' date.");
            return false;
        }
        setDateError("");
        return true;
    }

    const runSearch = useCallback(
        (page = 1) => {
            if (!validateDates()) return;
            setError("");
            setHasSearched(true);
            startTransition(async () => {
                try {
                    const data = await searchTaxpayers(filters, page);
                    setResult(data);
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

    // Active filter chips
    const chips: { label: string; clear: () => void }[] = [];
    if (filters.role) chips.push({ label: `Role: ${filters.role}`, clear: () => setFilter("role", "") });
    if (filters.clearanceStatus) chips.push({ label: `Status: ${filters.clearanceStatus.replace("_", " ")}`, clear: () => setFilter("clearanceStatus", "") });
    if (filters.dateFrom) chips.push({ label: `From: ${filters.dateFrom}`, clear: () => setFilter("dateFrom", "") });
    if (filters.dateTo) chips.push({ label: `To: ${filters.dateTo}`, clear: () => setFilter("dateTo", "") });

    return (
        <div className="space-y-6">
            {/* ── Page header ── */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Users className="h-6 w-6 text-primary" />
                    Taxpayer Intelligence Search
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Search registered traders using records and modules your RRA role can access.
                </p>
            </div>

            {/* ── Search form ── */}
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5" />
                        Find and Account
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Primary row: search + role + status + submit */}
                        <div className="flex flex-wrap gap-3 items-end">
                            {/* Search input */}
                            <div className="flex-[2] min-w-[200px]">
                                <Label htmlFor="ti-query" className="text-xs mb-1 block">
                                    TIN, trader, business name
                                </Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    <Input
                                        id="ti-query"
                                        value={filters.query ?? ""}
                                        onChange={(e) => setFilter("query", e.target.value)}
                                        placeholder="Search TIN, name or business…"
                                        className="pl-9"
                                        autoComplete="off"
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
                                <Label htmlFor="ti-role" className="text-xs mb-1 block">Business role</Label>
                                <select
                                    id="ti-role"
                                    value={filters.role ?? ""}
                                    onChange={(e) => setFilter("role", e.target.value as TaxpayerSearchFilters["role"])}
                                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    {ROLE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status filter */}
                            <div className="flex-1 min-w-[140px]">
                                <Label htmlFor="ti-status" className="text-xs mb-1 block">Account status</Label>
                                <select
                                    id="ti-status"
                                    value={filters.clearanceStatus ?? ""}
                                    onChange={(e) => setFilter("clearanceStatus", e.target.value as TaxpayerSearchFilters["clearanceStatus"])}
                                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={isPending}
                                className="h-10 gap-2 min-w-[110px]"
                            >
                                {isPending ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" />Searching…</>
                                ) : (
                                    <><Search className="h-4 w-4" />Search</>
                                )}
                            </Button>
                        </div>

                        {/* Advanced filters toggle */}
                        <div>
                            <button
                                type="button"
                                onClick={() => setAdvancedOpen((v) => !v)}
                                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                                aria-expanded={advancedOpen}
                            >
                                {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {advancedOpen ? "Hide" : "Show"} advanced filters
                            </button>

                            {/* Advanced filters section */}
                            {advancedOpen && (
                                <div className="mt-4 rounded-lg border bg-muted/20 p-4 space-y-4">
                                    {/* Account Details */}
                                    <fieldset>
                                        <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                            Account Creation Date
                                        </legend>
                                        <div className="flex flex-wrap gap-3 items-end">
                                            <div className="flex-1 min-w-[160px]">
                                                <Label htmlFor="ti-date-from" className="text-xs mb-1 block">From</Label>
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
                                                />
                                            </div>
                                            <div className="flex-1 min-w-[160px]">
                                                <Label htmlFor="ti-date-to" className="text-xs mb-1 block">To</Label>
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
                                                />
                                            </div>
                                        </div>
                                        {dateError && (
                                            <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" />
                                                {dateError}
                                            </p>
                                        )}
                                    </fieldset>
                                </div>
                            )}
                        </div>

                        {/* Active filter chips */}
                        {chips.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <span className="text-xs text-muted-foreground">Active filters:</span>
                                {chips.map((chip) => (
                                    <FilterChip key={chip.label} label={chip.label} onRemove={chip.clear} />
                                ))}
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                                >
                                    Clear all
                                </button>
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>

            {/* ── Results ── */}
            {!hasSearched && (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <Users className="h-10 w-10 mb-3 opacity-25" />
                    <p className="text-sm font-medium">Enter search criteria above</p>
                    <p className="text-xs mt-1">Results are scoped to your authorised RRA role.</p>
                </div>
            )}

            {hasSearched && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Search Results
                            </span>
                            {result && !isPending && (
                                <span className="text-xs font-normal text-muted-foreground">
                                    {result.totalRows} trader{result.totalRows !== 1 ? "s" : ""} found
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {/* Loading */}
                        {isPending && (
                            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-sm">Searching…</span>
                            </div>
                        )}

                        {/* Error */}
                        {!isPending && error && (
                            <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Empty */}
                        {!isPending && !error && result && result.rows.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                <Users className="h-8 w-8 mb-2 opacity-25" />
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
