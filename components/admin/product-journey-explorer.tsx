"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, ExternalLink, GitBranch, Loader2, Minus, Plus, Search } from "lucide-react";
import { searchProductJourney, type ProductJourneyPage } from "@/lib/actions/product-journey.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getJourneyChildren, getJourneyRootBusinessIds, isJourneyCycle } from "@/lib/product-journey-graph";

type JourneyRecord = ProductJourneyPage["records"][number];
type SourceRecord = ProductJourneyPage["sourceRecords"][number];

function statusLabel(record: JourneyRecord): string {
    if (record.disputed) return "Disputed";
    if (record.status === "pending") return "Pending receipt";
    if (record.status === "rejected" || record.status === "expired") return record.status;
    return "Recorded";
}

function statusVariant(record: JourneyRecord): "default" | "secondary" | "destructive" | "outline" {
    if (record.disputed || record.status === "rejected") return "destructive";
    if (record.status === "pending" || record.status === "expired") return "secondary";
    return "outline";
}

function formatQuantity(quantity: number, unit: string): string {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(quantity)} ${unit}`;
}

function JourneyBranch({
    businessId,
    records,
    depth,
    path,
    onSelect,
    selectedId,
    rendered,
}: {
    businessId: string;
    records: JourneyRecord[];
    depth: number;
    path: Set<string>;
    onSelect: (record: JourneyRecord) => void;
    selectedId: string | null;
    rendered: Set<string>;
}) {
    const [isExpanded, setIsExpanded] = useState(true);
    const outgoing = getJourneyChildren(records, businessId, rendered);
    if (!outgoing.length) return <p className="ml-6 border-l pl-4 py-2 text-xs text-muted-foreground">No further recorded transaction.</p>;
    if (depth >= 24) return <p className="ml-6 border-l pl-4 py-2 text-xs text-muted-foreground">Further branch hidden at the safe depth limit.</p>;

    return <div className="flex flex-col gap-3">{outgoing.map((record) => {
        const cycle = isJourneyCycle(path, record.buyerId);
        const nextPath = new Set(path);
        if (record.buyerId) nextPath.add(record.buyerId);
        const nextRendered = new Set(rendered);
        nextRendered.add(record.id);
        return <div key={record.id} className="ml-4 border-l border-muted-foreground/25 pl-4">
            <div className="flex items-start gap-2"><Button type="button" size="icon" variant="ghost" aria-label={`${isExpanded ? "Collapse" : "Expand"} branch from ${record.buyerName}`} aria-expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)}>{isExpanded ? <ChevronDown /> : <ChevronRight />}</Button><button type="button" onClick={() => onSelect(record)} aria-pressed={selectedId === record.id}
                className={cn("w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40", selectedId === record.id && "border-primary ring-1 ring-primary")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{record.sellerName} <ArrowRight className="mx-1 inline size-3.5" /> {record.buyerName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{record.sellerRole} · {formatQuantity(record.quantity, record.unit)} · {new Date(record.createdAt).toLocaleString()}</p>
                    </div>
                    <Badge variant={statusVariant(record)}>{statusLabel(record)}</Badge>
                </div>
            </button></div>
            {cycle ? <p className="ml-5 mt-2 text-xs text-amber-700">Circular relationship recorded; branch stops here.</p>
                : isExpanded && record.buyerId ? <JourneyBranch businessId={record.buyerId} records={records} depth={depth + 1} path={nextPath} onSelect={onSelect} selectedId={selectedId} rendered={nextRendered} />
                    : <p className="ml-5 py-2 text-xs text-muted-foreground">Final recorded consumer sale.</p>}
        </div>;
    })}</div>;
}

export function ProductJourneyExplorer() {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [data, setData] = useState<ProductJourneyPage | null>(null);
    const [selected, setSelected] = useState<JourneyRecord | SourceRecord | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(100);
    const [view, setView] = useState<"tree" | "table">("tree");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    async function search(offset = 0, append = false): Promise<void> {
        setLoading(true);
        setError(null);
        try {
            const result = await searchProductJourney({
                query,
                status: status as "all" | "pending" | "confirmed" | "completed" | "rejected" | "expired" | "disputed",
                from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
                to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
                offset,
            });
            setData((previous) => append && previous ? {
                ...result,
                records: [...previous.records, ...result.records],
                sourceRecords: [...previous.sourceRecords, ...result.sourceRecords.filter((item) => !previous.sourceRecords.some((old) => old.id === item.id))],
            } : result);
            setSelected(null);
            setExpanded(new Set());
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Product journey search failed.");
            if (!append) setData(null);
        } finally {
            setLoading(false);
        }
    }

    const roots = useMemo(() => data ? getJourneyRootBusinessIds(data.records) : [], [data]);

    return <div className="flex flex-col gap-4">
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Search className="size-4" /> Search recorded journey</CardTitle>
                <CardDescription>Search product, batch reference, business/TIN, transaction, or import reference. At least two characters are required.</CardDescription></CardHeader>
            <CardContent>
                <form className="grid gap-3 md:grid-cols-6" onSubmit={(event) => { event.preventDefault(); void search(); }}>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">Search<Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="Product, TIN, batch, transaction…" /></label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground">
                        <option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed sale</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="disputed">Has dispute</option>
                    </select></label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">From<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">To<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
                    <div className="flex items-end"><Button type="submit" disabled={loading} className="w-full">{loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}Search</Button></div>
                </form>
                {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            </CardContent>
        </Card>

        {data && <>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Showing {data.records.length} of {data.total} matching transaction records. Connections represent recorded transactions.</p>
                <div className="flex gap-2"><Button size="sm" variant={view === "tree" ? "default" : "outline"} onClick={() => setView("tree")}>Tree</Button><Button size="sm" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>Accessible table</Button></div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <Card className="min-w-0 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between gap-2"><div><CardTitle className="flex items-center gap-2"><GitBranch className="size-4" /> Recorded network</CardTitle><CardDescription>Branches expand from each receiving business. A branch stops where records stop.</CardDescription></div>
                        <div className="flex shrink-0 gap-1"><Button size="icon" variant="outline" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(70, value - 10))}><Minus /></Button><Button size="sm" variant="outline" onClick={() => setZoom(100)}>{zoom}% · Fit</Button><Button size="icon" variant="outline" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(120, value + 10))}><Plus /></Button></div>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-4 flex flex-wrap gap-2 text-xs"><Badge variant="outline">Recorded / completed</Badge><Badge variant="secondary">Pending receipt</Badge><Badge variant="destructive">Disputed / rejected</Badge><span className="self-center text-muted-foreground">No edge means no linked transaction was found.</span></div>
                        {data.sourceRecords.length > 0 && <section className="mb-5 rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">Origin and adjustment records (not transaction-linked)</h3><p className="mb-2 text-xs text-muted-foreground">Production batches, imports, and stock adjustments are shown separately because the current schema has no batch allocation links to transactions.</p><div className="flex flex-wrap gap-2">{data.sourceRecords.map((source) => <button key={`${source.kind}:${source.id}`} onClick={() => setSelected(source)} className="rounded-md border bg-muted/30 px-3 py-2 text-left text-xs hover:bg-accent"><span className="block font-medium">{source.kind === "production_batch" ? "Production batch" : source.kind === "import_declaration" ? "Import" : "Stock adjustment"}: {source.reference}</span><span className="text-muted-foreground">{source.businessName} · {formatQuantity(source.quantity, data.records.find((record) => record.productId === source.productId)?.unit ?? "units")}</span></button>)}</div></section>}
                        {view === "tree" ? <div className="max-h-[70vh] overflow-auto rounded-md border p-3"><div className={cn("min-w-[32rem] origin-top-left transition-transform", zoom === 90 && "scale-[0.9]", zoom === 80 && "scale-[0.8]", zoom === 70 && "scale-[0.7]", zoom === 110 && "scale-[1.1]", zoom === 120 && "scale-[1.2]")}>
                            {roots.length ? roots.map((rootId) => {
                                const root = data.records.find((record) => record.sellerId === rootId)!;
                                const isExpanded = expanded.has(rootId);
                                return <div key={rootId} className="mb-4"><Button variant="ghost" size="sm" aria-expanded={isExpanded} onClick={() => setExpanded((prior) => { const next = new Set(prior); if (next.has(rootId)) next.delete(rootId); else next.add(rootId); return next; })}>{isExpanded ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}{root.sellerName} · {root.sellerRole}</Button>
                                    {isExpanded && <JourneyBranch businessId={rootId} records={data.records} depth={0} path={new Set([rootId])} onSelect={setSelected} selectedId={selected && "sellerId" in selected ? selected.id : null} rendered={new Set()} />}</div>;
                            }) : <p className="py-8 text-center text-sm text-muted-foreground">No transaction records matched. Origin records may still be listed above.</p>}
                        </div></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Transaction</TableHead><TableHead>Seller → buyer</TableHead><TableHead>Product</TableHead><TableHead>Quantity</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{data.records.map((record) => <TableRow key={record.id} onClick={() => setSelected(record)} className="cursor-pointer"><TableCell><Link href={record.recordUrl} className="font-mono text-xs underline" onClick={(event) => event.stopPropagation()}>{record.id.slice(0, 12)}</Link></TableCell><TableCell>{record.sellerName} → {record.buyerName}</TableCell><TableCell>{record.productName}</TableCell><TableCell>{formatQuantity(record.quantity, record.unit)}</TableCell><TableCell><Badge variant={statusVariant(record)}>{statusLabel(record)}</Badge></TableCell><TableCell>{new Date(record.createdAt).toLocaleDateString()}</TableCell></TableRow>)}</TableBody></Table></div>}
                        {data.hasMore && <div className="mt-4 flex justify-center"><Button variant="outline" disabled={loading} onClick={() => void search(data.offset + data.records.length, true)}>{loading && <Loader2 className="animate-spin" data-icon="inline-start" />}Load next 100 records</Button></div>}
                    </CardContent>
                </Card>

                <Card className="h-fit xl:sticky xl:top-4"><CardHeader><CardTitle>Record details</CardTitle><CardDescription>{selected ? "Selected supporting record" : "Select a node to inspect the underlying record."}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 text-sm">
                    {!selected ? <p className="text-muted-foreground">The full journey remains visible while you inspect a record here.</p> : "sellerId" in selected ? <>
                        <div><p className="text-xs text-muted-foreground">Seller</p><p className="font-medium">{selected.sellerName}</p><p className="text-xs text-muted-foreground">{selected.sellerRole} · TIN {selected.sellerTin ?? "not recorded"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Buyer</p><p className="font-medium">{selected.buyerName}</p><p className="text-xs text-muted-foreground">{selected.buyerRole ?? "consumer"} · TIN {selected.buyerTin ?? "not recorded"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Product / quantity</p><p>{selected.productName} · {formatQuantity(selected.quantity, selected.unit)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Transaction / status</p><p className="break-all font-mono text-xs">{selected.id}</p><Badge variant={statusVariant(selected)}>{statusLabel(selected)}</Badge></div>
                        <div><p className="text-xs text-muted-foreground">Dispatch recorded</p><p>{new Date(selected.createdAt).toLocaleString()}</p><p className="text-xs text-muted-foreground">Receipt confirmed: {selected.confirmedAt ? new Date(selected.confirmedAt).toLocaleString() : "No confirmation recorded"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Other recorded transactions involving this seller</p><div className="mt-1 flex flex-col gap-1">{data.records.filter((record) => record.id !== selected.id && (record.sellerId === selected.sellerId || record.buyerId === selected.sellerId)).slice(0, 5).map((record) => <Link key={record.id} className="text-xs underline" href={record.recordUrl}>{record.productName} · {formatQuantity(record.quantity, record.unit)} · {record.status}</Link>)}</div></div>
                        <div><p className="text-xs text-muted-foreground">Other recorded transactions involving this buyer</p><div className="mt-1 flex flex-col gap-1">{selected.buyerId ? data.records.filter((record) => record.id !== selected.id && (record.sellerId === selected.buyerId || record.buyerId === selected.buyerId)).slice(0, 5).map((record) => <Link key={record.id} className="text-xs underline" href={record.recordUrl}>{record.productName} · {formatQuantity(record.quantity, record.unit)} · {record.status}</Link>) : <p className="text-xs text-muted-foreground">No business buyer is recorded for this consumer sale.</p>}</div></div>
                        {selected.disputed && <div className="rounded-md border border-destructive/30 p-2 text-xs"><AlertTriangle className="mr-1 inline size-3.5" />Linked dispute: {selected.disputeId}</div>}
                        <Button asChild variant="outline" size="sm"><Link href={selected.recordUrl}>Open transaction <ExternalLink data-icon="inline-end" /></Link></Button>
                    </> : <>
                        <div><p className="text-xs text-muted-foreground">{selected.kind === "production_batch" ? "Production batch" : selected.kind === "import_declaration" ? "Import declaration" : "Stock adjustment"}</p><p className="break-all font-medium">{selected.reference}</p></div>
                        <div><p className="text-xs text-muted-foreground">Business</p><p>{selected.businessName}</p><p className="text-xs text-muted-foreground">TIN {selected.businessTin ?? "not recorded"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Product / {selected.kind === "stock_adjustment" ? "quantity change" : "recorded quantity"}</p><p>{selected.productName} · {formatQuantity(selected.quantity, data.records.find((record) => record.productId === selected.productId)?.unit ?? "units")}</p><Badge variant={selected.status === "approved" ? "outline" : "secondary"}>{selected.status}</Badge></div>
                        <p className="text-xs text-muted-foreground">This record is not linked to downstream transaction quantities by batch in the current database.</p>
                        <Button asChild variant="outline" size="sm"><Link href={selected.recordUrl}>Open source record <ExternalLink data-icon="inline-end" /></Link></Button>
                    </>}
                </CardContent></Card>
            </div>
        </>}
    </div>;
}
