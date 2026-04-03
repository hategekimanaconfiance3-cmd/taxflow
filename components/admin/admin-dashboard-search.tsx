"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminGlobalSearch } from "@/lib/actions/admin-dashboard.action";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import {
    Search,
    Loader2,
    Users,
    ArrowLeftRight,
    Ship,
    Shield,
    X,
} from "lucide-react";
import Link from "next/link";

type SearchResults = Awaited<ReturnType<typeof adminGlobalSearch>>;

const statusColors: Record<string, string> = {
    pending: "text-amber-600",
    confirmed: "text-emerald-600",
    completed: "text-blue-600",
    rejected: "text-red-600",
    submitted: "text-violet-600",
    activated: "text-emerald-600",
    filed: "text-amber-600",
    under_review: "text-blue-600",
    resolved: "text-emerald-600",
    dismissed: "text-zinc-600",
    cleared: "text-emerald-600",
    flagged: "text-amber-600",
    suspended: "text-red-600",
};

export function AdminDashboardSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults | null>(null);
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout>(undefined);

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    function handleSearch(value: string) {
        setQuery(value);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (value.trim().length < 2) {
            setResults(null);
            setIsOpen(false);
            return;
        }

        debounceRef.current = setTimeout(() => {
            startTransition(async () => {
                try {
                    const data = await adminGlobalSearch(value);
                    setResults(data);
                    setIsOpen(true);
                } catch {
                    setResults(null);
                }
            });
        }, 300);
    }

    function clearSearch() {
        setQuery("");
        setResults(null);
        setIsOpen(false);
    }

    const totalResults =
        (results?.traders.length ?? 0) +
        (results?.transactions.length ?? 0) +
        (results?.imports.length ?? 0) +
        (results?.disputes.length ?? 0);

    return (
        <div ref={containerRef} className="relative w-full max-w-lg">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search traders, transactions, imports, disputes..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => results && setIsOpen(true)}
                    className="pl-9 pr-9 h-9 text-sm"
                />
                {isPending && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {query && !isPending && (
                    <button
                        onClick={clearSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* Dropdown results */}
            {isOpen && results && (
                <Card className="absolute top-full mt-1 right-0 z-50 w-[580px] max-h-[480px] overflow-y-auto shadow-xl border p-0">
                    <div className="p-2 text-xs text-muted-foreground border-b">
                        {totalResults} result{totalResults !== 1 ? "s" : ""}{" "}
                        for &quot;{query}&quot;
                    </div>

                    {/* Traders */}
                    {results.traders.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Traders
                            </div>
                            {results.traders.map((t) => (
                                <Link
                                    key={t.id}
                                    href={`/admin/traders/${t.id}`}
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center justify-between px-3 py-2 hover:bg-accent transition-colors"
                                >
                                    <div>
                                        <p className="text-sm font-medium">
                                            {t.businessName ?? "—"}
                                        </p>
                                        <p className="text-xs text-muted-foreground font-mono">
                                            {t.tinNumber ?? "—"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Badge
                                            variant="outline"
                                            className="text-[10px] capitalize"
                                        >
                                            {t.role}
                                        </Badge>
                                        <span
                                            className={`text-[10px] font-medium ${statusColors[t.clearanceStatus ?? ""] || ""}`}
                                        >
                                            {t.clearanceStatus}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Transactions */}
                    {results.transactions.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 flex items-center gap-1">
                                <ArrowLeftRight className="h-3 w-3" />
                                Transactions
                            </div>
                            {results.transactions.map((t) => (
                                <Link
                                    key={t.id}
                                    href="/admin/transactions"
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center justify-between px-3 py-2 hover:bg-accent transition-colors"
                                >
                                    <div>
                                        <p className="text-sm font-medium">
                                            {t.productName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {t.sellerName} ·{" "}
                                            {formatRWF(t.totalAmount)}
                                        </p>
                                    </div>
                                    <Badge
                                        variant="secondary"
                                        className={`text-[10px] ${statusColors[t.status] || ""}`}
                                    >
                                        {t.status}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Imports */}
                    {results.imports.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 flex items-center gap-1">
                                <Ship className="h-3 w-3" />
                                Imports
                            </div>
                            {results.imports.map((i) => (
                                <Link
                                    key={i.id}
                                    href="/admin/imports"
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center justify-between px-3 py-2 hover:bg-accent transition-colors"
                                >
                                    <div>
                                        <p className="text-sm font-medium">
                                            {i.productName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {i.businessName}{" "}
                                            {i.customsRef
                                                ? `· ${i.customsRef}`
                                                : ""}
                                        </p>
                                    </div>
                                    <Badge
                                        variant="secondary"
                                        className={`text-[10px] ${statusColors[i.status] || ""}`}
                                    >
                                        {i.status}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Disputes */}
                    {results.disputes.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                Disputes
                            </div>
                            {results.disputes.map((d) => (
                                <Link
                                    key={d.id}
                                    href="/admin/disputes"
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center justify-between px-3 py-2 hover:bg-accent transition-colors"
                                >
                                    <div>
                                        <p className="text-sm font-mono font-semibold">
                                            {d.referenceNumber}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                            {d.filedByName} · {d.reason}
                                        </p>
                                    </div>
                                    <Badge
                                        variant="secondary"
                                        className={`text-[10px] ${statusColors[d.status] || ""}`}
                                    >
                                        {d.status.replace("_", " ")}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    )}

                    {totalResults === 0 && (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            No results found
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}
