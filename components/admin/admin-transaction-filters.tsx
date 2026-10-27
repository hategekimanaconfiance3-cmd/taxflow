"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Search, X, Filter } from "lucide-react";

const STATUS_OPTIONS = [
    { value: "all", label: "All Statuses" },
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "completed", label: "Completed" },
    { value: "rejected", label: "Rejected" },
];

export function AdminTransactionFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [search, setSearch] = useState(searchParams.get("search") ?? "");
    const [status, setStatus] = useState(
        searchParams.get("status") ?? "all",
    );
    const [dateFrom, setDateFrom] = useState(
        searchParams.get("dateFrom") ?? "",
    );
    const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");

    const applyFilters = useCallback(() => {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (status !== "all") params.set("status", status);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const q = params.toString();
        router.push(`/admin/transactions${q ? `?${q}` : ""}`);
    }, [router, search, status, dateFrom, dateTo]);

    function clearFilters() {
        setSearch("");
        setStatus("all");
        setDateFrom("");
        setDateTo("");
        router.push("/admin/transactions");
    }

    const hasFilters =
        search.trim() !== "" ||
        status !== "all" ||
        dateFrom !== "" ||
        dateTo !== "";

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative w-full min-w-0 flex-1 sm:min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search product, seller, or buyer..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                        className="pl-9 h-9 text-sm"
                    />
                </div>

                {/* Status */}
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 w-full text-sm sm:h-9 sm:w-[150px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Date From */}
                <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-10 w-full text-sm sm:h-9 sm:w-[150px]"
                    placeholder="From"
                />

                {/* Date To */}
                <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-10 w-full text-sm sm:h-9 sm:w-[150px]"
                    placeholder="To"
                />

                {/* Apply */}
                <Button
                    onClick={applyFilters}
                    size="sm"
                    className="h-10 w-full gap-1.5 sm:h-9 sm:w-auto"
                >
                    <Filter className="h-3.5 w-3.5" />
                    Filter
                </Button>

                {/* Clear */}
                {hasFilters && (
                    <Button
                        onClick={clearFilters}
                        variant="ghost"
                        size="sm"
                        className="h-10 w-full gap-1.5 text-muted-foreground sm:h-9 sm:w-auto"
                    >
                        <X className="h-3.5 w-3.5" />
                        Clear
                    </Button>
                )}
            </div>
        </div>
    );
}
