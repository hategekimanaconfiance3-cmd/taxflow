"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Search,
    Sparkles,
    ArrowRight,
    CornerDownLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    group?: string;
    keywords?: string[];
}

interface CommandPaletteProps {
    items: CommandItem[];
    /** Label shown in the header, e.g. "TaxFlow" or "RRA Admin" */
    portalLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({
    items,
    portalLabel = "TaxFlow",
}: CommandPaletteProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // ── Filtered results ────────────────────────────────────
    const filtered = query.trim()
        ? items.filter((item) => {
              const q = query.toLowerCase();
              return (
                  item.label.toLowerCase().includes(q) ||
                  item.href.toLowerCase().includes(q) ||
                  item.group?.toLowerCase().includes(q) ||
                  item.keywords?.some((k) => k.toLowerCase().includes(q))
              );
          })
        : items;

    // Group results
    const grouped = filtered.reduce<Record<string, CommandItem[]>>(
        (acc, item) => {
            const group = item.group || "Navigation";
            if (!acc[group]) acc[group] = [];
            acc[group].push(item);
            return acc;
        },
        {}
    );

    const flatFiltered = Object.values(grouped).flat();

    // ── Keyboard shortcut: F to open, Esc to close ─────────
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            const isInput =
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.tagName === "SELECT" ||
                target.isContentEditable;

            // F key to open (only when not typing in an input)
            if (e.key === "f" && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setOpen(true);
            }

            // Esc to close
            if (e.key === "Escape" && open) {
                e.preventDefault();
                setOpen(false);
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open]);

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setQuery("");
            setActiveIndex(0);
            // Small delay to ensure the dialog is mounted
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    // Reset active index on query change
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    // Scroll active item into view
    useEffect(() => {
        const el = listRef.current?.querySelector("[data-active='true']");
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    // ── Navigate ────────────────────────────────────────────
    const navigate = useCallback(
        (item: CommandItem) => {
            setOpen(false);
            router.push(item.href);
        },
        [router]
    );

    // ── Keyboard navigation inside the palette ──────────────
    function handleInputKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) =>
                i < flatFiltered.length - 1 ? i + 1 : 0
            );
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) =>
                i > 0 ? i - 1 : flatFiltered.length - 1
            );
        } else if (e.key === "Enter") {
            e.preventDefault();
            const target = flatFiltered[activeIndex];
            if (target) navigate(target);
        }
    }

    if (!open) return null;

    return (
        <>
            {/* ── Backdrop ──────────────────────────────────── */}
            <div
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
                onClick={() => setOpen(false)}
            />

            {/* ── Palette ───────────────────────────────────── */}
            <div className="fixed inset-x-0 top-[15%] z-50 mx-auto w-full max-w-[540px] px-4 animate-in slide-in-from-top-2 fade-in-0 duration-200">
                <div className="overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl">
                    {/* ── Search input ────────────────────── */}
                    <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
                        <Search className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleInputKeyDown}
                            placeholder="Find..."
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <kbd className="pointer-events-none hidden h-5 select-none items-center rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                            Esc
                        </kbd>
                    </div>

                    {/* ── Results ─────────────────────────── */}
                    <div
                        ref={listRef}
                        className="max-h-[360px] overflow-y-auto overscroll-contain py-2 scrollbar-thin"
                    >
                        {flatFiltered.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm text-muted-foreground/60">
                                    No results for &ldquo;{query}&rdquo;
                                </p>
                            </div>
                        ) : (
                            Object.entries(grouped).map(
                                ([group, groupItems]) => (
                                    <div key={group}>
                                        <div className="px-4 pt-2 pb-1">
                                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                                                {group}
                                            </span>
                                        </div>
                                        {groupItems.map((item) => {
                                            const globalIdx =
                                                flatFiltered.indexOf(item);
                                            const isActive =
                                                globalIdx === activeIndex;

                                            return (
                                                <button
                                                    key={item.href}
                                                    type="button"
                                                    data-active={isActive}
                                                    onClick={() =>
                                                        navigate(item)
                                                    }
                                                    onMouseEnter={() =>
                                                        setActiveIndex(
                                                            globalIdx
                                                        )
                                                    }
                                                    className={cn(
                                                        "group flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                                                        isActive
                                                            ? "bg-accent text-foreground"
                                                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                                    )}
                                                >
                                                    <item.icon
                                                        className={cn(
                                                            "h-4 w-4 shrink-0 transition-colors",
                                                            isActive
                                                                ? "text-foreground"
                                                                : "text-muted-foreground/60"
                                                        )}
                                                    />
                                                    <span className="flex-1 font-medium">
                                                        {item.label}
                                                    </span>
                                                    {isActive && (
                                                        <CornerDownLeft className="h-3 w-3 text-muted-foreground/50" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )
                            )
                        )}
                    </div>

                    {/* ── Footer ──────────────────────────── */}
                    <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                            <Sparkles className="h-3 w-3" />
                            <span>AI search coming soon</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50">
                            <span className="flex items-center gap-1">
                                <kbd className="rounded border border-border/60 bg-muted px-1 font-mono text-[10px]">
                                    ↑↓
                                </kbd>
                                navigate
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="rounded border border-border/60 bg-muted px-1 font-mono text-[10px]">
                                    ↵
                                </kbd>
                                open
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Trigger button — used in sidebars
// ---------------------------------------------------------------------------

export function CommandPaletteTrigger({
    onClick,
    className,
}: {
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex w-full items-center gap-2.5 rounded-md border border-border/60 px-3 py-[7px] text-sm transition-colors hover:bg-accent/50",
                className
            )}
        >
            <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="flex-1 text-left text-muted-foreground/70 text-[13px]">
                Find...
            </span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                F
            </kbd>
        </button>
    );
}
