"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Presets — each returns a { from, to } date range
// ---------------------------------------------------------------------------

type Preset = {
    label: string;
    key: string;
    getRange: () => { from: string; to: string };
};

function toDateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

const PRESETS: Preset[] = [
    {
        label: "Today",
        key: "today",
        getRange: () => {
            const now = new Date();
            return { from: toDateStr(now), to: toDateStr(now) };
        },
    },
    {
        label: "This Week",
        key: "week",
        getRange: () => {
            const now = new Date();
            const dow = now.getDay();
            const start = new Date(now);
            start.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); // Monday
            return { from: toDateStr(start), to: toDateStr(now) };
        },
    },
    {
        label: "This Month",
        key: "month",
        getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: toDateStr(start), to: toDateStr(now) };
        },
    },
    {
        label: "This Quarter",
        key: "quarter",
        getRange: () => {
            const now = new Date();
            const qMonth = Math.floor(now.getMonth() / 3) * 3;
            const start = new Date(now.getFullYear(), qMonth, 1);
            return { from: toDateStr(start), to: toDateStr(now) };
        },
    },
    {
        label: "This Year",
        key: "year",
        getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), 0, 1);
            return { from: toDateStr(start), to: toDateStr(now) };
        },
    },
    {
        label: "All Time",
        key: "all",
        getRange: () => ({ from: "", to: "" }),
    },
];

// ---------------------------------------------------------------------------
// TimeFilter Component
// ---------------------------------------------------------------------------

export function TimeFilter() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const currentFrom = searchParams.get("from") ?? "";
    const currentTo = searchParams.get("to") ?? "";

    const [customFrom, setCustomFrom] = useState(currentFrom);
    const [customTo, setCustomTo] = useState(currentTo);

    const applyRange = useCallback(
        (from: string, to: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (from) params.set("from", from);
            else params.delete("from");
            if (to) params.set("to", to);
            else params.delete("to");
            router.push(`${pathname}?${params.toString()}`);
        },
        [router, pathname, searchParams],
    );

    // Determine active label
    const activeLabel =
        !currentFrom && !currentTo
            ? "All Time"
            : PRESETS.find((p) => {
                  if (p.key === "all") return false;
                  const range = p.getRange();
                  return range.from === currentFrom && range.to === currentTo;
              })?.label ?? `${currentFrom} – ${currentTo}`;

    return (
        <div className="flex items-center gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        id="time-filter-trigger"
                    >
                        <Calendar className="h-3.5 w-3.5" />
                        {activeLabel}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    {PRESETS.map((preset) => (
                        <DropdownMenuItem
                            key={preset.key}
                            onClick={() => {
                                const range = preset.getRange();
                                applyRange(range.from, range.to);
                            }}
                            className={
                                preset.label === activeLabel ? "font-semibold bg-accent" : ""
                            }
                        >
                            {preset.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <Popover>
                        <PopoverTrigger asChild>
                            <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="cursor-pointer"
                            >
                                Custom Range…
                            </DropdownMenuItem>
                        </PopoverTrigger>
                        <PopoverContent
                            side="left"
                            align="start"
                            className="w-64 space-y-3"
                        >
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="custom-from"
                                    className="text-xs font-medium"
                                >
                                    From
                                </Label>
                                <Input
                                    id="custom-from"
                                    type="date"
                                    value={customFrom}
                                    onChange={(e) =>
                                        setCustomFrom(e.target.value)
                                    }
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="custom-to"
                                    className="text-xs font-medium"
                                >
                                    To
                                </Label>
                                <Input
                                    id="custom-to"
                                    type="date"
                                    value={customTo}
                                    onChange={(e) =>
                                        setCustomTo(e.target.value)
                                    }
                                    className="h-8 text-xs"
                                />
                            </div>
                            <Button
                                size="sm"
                                className="w-full h-8 text-xs"
                                onClick={() => applyRange(customFrom, customTo)}
                                disabled={!customFrom || !customTo}
                            >
                                Apply Range
                            </Button>
                        </PopoverContent>
                    </Popover>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
