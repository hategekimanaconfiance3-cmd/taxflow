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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

type Preset = { label: string; key: string; getRange: () => { from: string; to: string } };

function toDateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

const PRESETS: Preset[] = [
    { label: "Today", key: "today", getRange: () => { const n = new Date(); return { from: toDateStr(n), to: toDateStr(n) }; } },
    { label: "This Week", key: "week", getRange: () => { const n = new Date(); const d = n.getDay(); const s = new Date(n); s.setDate(n.getDate() - (d === 0 ? 6 : d - 1)); return { from: toDateStr(s), to: toDateStr(n) }; } },
    { label: "This Month", key: "month", getRange: () => { const n = new Date(); return { from: toDateStr(new Date(n.getFullYear(), n.getMonth(), 1)), to: toDateStr(n) }; } },
    { label: "This Quarter", key: "quarter", getRange: () => { const n = new Date(); const qm = Math.floor(n.getMonth() / 3) * 3; return { from: toDateStr(new Date(n.getFullYear(), qm, 1)), to: toDateStr(n) }; } },
    { label: "This Year", key: "year", getRange: () => { const n = new Date(); return { from: toDateStr(new Date(n.getFullYear(), 0, 1)), to: toDateStr(n) }; } },
    { label: "All Time", key: "all", getRange: () => ({ from: "", to: "" }) },
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
    const [dialogOpen, setDialogOpen] = useState(false);

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

    const activeLabel =
        !currentFrom && !currentTo
            ? "All Time"
            : PRESETS.find((p) => {
                  if (p.key === "all") return false;
                  const r = p.getRange();
                  return r.from === currentFrom && r.to === currentTo;
              })?.label ?? `${currentFrom} – ${currentTo}`;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                        <Calendar className="h-3.5 w-3.5" />
                        {activeLabel}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    {PRESETS.map((preset) => (
                        <DropdownMenuItem
                            key={preset.key}
                            onClick={() => { const r = preset.getRange(); applyRange(r.from, r.to); }}
                            className={preset.label === activeLabel ? "font-semibold bg-accent" : ""}
                        >
                            {preset.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onSelect={(e) => { e.preventDefault(); setCustomFrom(currentFrom); setCustomTo(currentTo); setDialogOpen(true); }}
                        className="cursor-pointer"
                    >
                        Custom Range…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Custom range dialog — rendered in a portal, unaffected by dropdown closing */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[320px]">
                    <DialogHeader>
                        <DialogTitle className="text-sm">Custom Date Range</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        <div className="space-y-1.5">
                            <Label htmlFor="custom-from" className="text-xs font-medium">From</Label>
                            <Input
                                id="custom-from"
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="custom-to" className="text-xs font-medium">To</Label>
                            <Input
                                id="custom-to"
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => { applyRange(customFrom, customTo); setDialogOpen(false); }}
                            disabled={!customFrom || !customTo}
                        >
                            Apply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
