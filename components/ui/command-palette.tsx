"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Search,
    Sparkles,
    CornerDownLeft,
    Loader2,
    ExternalLink,
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

type AiState = "idle" | "loading" | "done" | "error";

interface AiResult {
    text: string;
    links: Array<{ label: string; href: string }>;
}

// ---------------------------------------------------------------------------
// Markdown renderer (mirrors ai-chat-widget formatMessage)
// ---------------------------------------------------------------------------

function formatInline(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">$1</code>');
}

function renderTable(lines: string[]): string {
    const dataRows = lines.filter((line) => !/^\|[\s-:|]+\|$/.test(line.trim()));
    if (dataRows.length === 0) return "";

    const parseRow = (line: string): string[] =>
        line.split("|").slice(1, -1).map((cell) => cell.trim());

    const headerCells = parseRow(dataRows[0]!);
    const bodyRows = dataRows.slice(1).map(parseRow);

    const headerHtml = headerCells
        .map(
            (cell) =>
                `<th class="px-2 py-1 text-left font-semibold text-[11px] border-b border-border bg-muted/50">${formatInline(cell)}</th>`,
        )
        .join("");

    const bodyHtml = bodyRows
        .map(
            (row) =>
                `<tr class="border-b border-border/50 last:border-0">${row.map((cell) => `<td class="px-2 py-1 text-[11px]">${formatInline(cell)}</td>`).join("")}</tr>`,
        )
        .join("");

    return `<div class="overflow-x-auto my-2 rounded-lg border border-border"><table class="w-full"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function formatMessage(text: string): string {
    const lines = text.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        if (lines[i]?.includes("|") && lines[i]?.trim().startsWith("|")) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i]?.includes("|") && lines[i]?.trim().startsWith("|")) {
                tableLines.push(lines[i]!);
                i++;
            }
            result.push(renderTable(tableLines));
            continue;
        }

        const line = lines[i]!;

        if (line.startsWith("### ")) {
            result.push(`<h4 class="font-semibold text-[13px] mt-2 mb-0.5">${formatInline(line.slice(4))}</h4>`);
        } else if (line.startsWith("## ")) {
            result.push(`<h3 class="font-semibold text-sm mt-2 mb-0.5">${formatInline(line.slice(3))}</h3>`);
        } else if (line.startsWith("# ")) {
            result.push(`<h3 class="font-bold text-sm mt-2 mb-0.5">${formatInline(line.slice(2))}</h3>`);
        } else if (/^[-*]\s/.test(line.trim())) {
            const items: string[] = [];
            while (i < lines.length && /^[-*]\s/.test(lines[i]?.trim() ?? "")) {
                items.push(lines[i]!.trim().replace(/^[-*]\s/, ""));
                i++;
            }
            result.push(
                `<ul class="list-disc list-inside space-y-0.5 my-1">${items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ul>`,
            );
            continue;
        } else if (/^\d+\.\s/.test(line.trim())) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i]?.trim() ?? "")) {
                items.push(lines[i]!.trim().replace(/^\d+\.\s/, ""));
                i++;
            }
            result.push(
                `<ol class="list-decimal list-inside space-y-0.5 my-1">${items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ol>`,
            );
            continue;
        } else if (/^---+$/.test(line.trim())) {
            result.push('<hr class="my-2 border-border" />');
        } else if (line.trim() === "") {
            result.push("<br/>");
        } else {
            result.push(`<p class="my-0.5">${formatInline(line)}</p>`);
        }

        i++;
    }

    return result.join("");
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
    const [aiState, setAiState] = useState<AiState>("idle");
    const [aiResult, setAiResult] = useState<AiResult>({ text: "", links: [] });
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

    const showAiItem = query.trim().length > 0 && aiState === "idle";
    const AI_ITEM_INDEX = flatFiltered.length;

    // ── AI search ───────────────────────────────────────────
    const runAiSearch = useCallback(async (q: string) => {
        if (!q.trim()) return;
        setAiState("loading");
        setAiResult({ text: "", links: [] });
        try {
            const res = await fetch("/api/ai/command-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: q }),
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            setAiResult({
                text: data.answer ?? "No answer returned.",
                links: Array.isArray(data.links) ? data.links : [],
            });
            setAiState("done");
        } catch {
            setAiResult({ text: "Search failed. Please try again.", links: [] });
            setAiState("error");
        }
    }, []);

    // ── Keyboard shortcut: F to open, Esc to close ─────────
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            const isInput =
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.tagName === "SELECT" ||
                target.isContentEditable;

            if (e.key === "f" && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setOpen(true);
            }

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
            setAiState("idle");
            setAiResult({ text: "", links: [] });
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    // Reset when query changes
    useEffect(() => {
        setActiveIndex(0);
        setAiState("idle");
        setAiResult({ text: "", links: [] });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    // Scroll active item into view
    useEffect(() => {
        const el = listRef.current?.querySelector("[data-active='true']");
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    // ── Navigate ────────────────────────────────────────────
    const navigate = useCallback(
        (href: string) => {
            setOpen(false);
            router.push(href);
        },
        [router]
    );

    // ── Keyboard navigation inside the palette ──────────────
    function handleInputKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const maxIndex = showAiItem ? AI_ITEM_INDEX : flatFiltered.length - 1;
            setActiveIndex((i) => (i < maxIndex ? i + 1 : 0));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const maxIndex = showAiItem ? AI_ITEM_INDEX : flatFiltered.length - 1;
            setActiveIndex((i) => (i > 0 ? i - 1 : maxIndex));
        } else if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            if (query.trim()) runAiSearch(query.trim());
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (showAiItem && activeIndex === AI_ITEM_INDEX) {
                runAiSearch(query.trim());
            } else {
                const target = flatFiltered[activeIndex];
                if (target) navigate(target.href);
            }
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
                        {aiState === "loading" ? (
                            <Loader2 className="h-4 w-4 text-muted-foreground/60 shrink-0 animate-spin" />
                        ) : aiState !== "idle" ? (
                            <Sparkles className="h-4 w-4 text-blue-500/70 shrink-0" />
                        ) : (
                            <Search className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        )}
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
                        className="max-h-[380px] overflow-y-auto overscroll-contain py-2 scrollbar-thin"
                    >
                        {/* AI Loading */}
                        {aiState === "loading" && (
                            <div className="flex items-center gap-3 px-4 py-8">
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500/70" />
                                <p className="text-sm text-muted-foreground">Searching data...</p>
                            </div>
                        )}

                        {/* AI Answer */}
                        {(aiState === "done" || aiState === "error") && (
                            <div className="px-4 py-3 space-y-3">
                                {/* Label */}
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-3.5 w-3.5 text-blue-500/70 shrink-0" />
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-500/70">
                                        Taxflow AI
                                    </span>
                                </div>

                                {/* Answer body — markdown rendered */}
                                <div
                                    className="text-sm text-foreground/80 leading-relaxed prose prose-sm dark:prose-invert max-w-none [&>p]:my-0.5 [&>ul]:my-1 [&>ol]:my-1 [&>table]:my-2 [&_strong]:text-foreground"
                                    dangerouslySetInnerHTML={{ __html: formatMessage(aiResult.text) }}
                                />

                                {/* Navigation link chips */}
                                {aiResult.links.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {aiResult.links.map((link) => (
                                            <button
                                                key={link.href}
                                                type="button"
                                                onClick={() => navigate(link.href)}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/5 px-3 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-500/15 hover:border-blue-500/50 dark:text-blue-400"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                                {link.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Navigation Results */}
                        {aiState === "idle" && (
                            <>
                                {flatFiltered.length === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <p className="text-sm text-muted-foreground/60">
                                            No results for &ldquo;{query}&rdquo;
                                        </p>
                                    </div>
                                ) : (
                                    Object.entries(grouped).map(([group, groupItems]) => (
                                        <div key={group}>
                                            <div className="px-4 pt-2 pb-1">
                                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                                                    {group}
                                                </span>
                                            </div>
                                            {groupItems.map((item) => {
                                                const globalIdx = flatFiltered.indexOf(item);
                                                const isActive = globalIdx === activeIndex;

                                                return (
                                                    <button
                                                        key={item.href}
                                                        type="button"
                                                        data-active={isActive}
                                                        onClick={() => navigate(item.href)}
                                                        onMouseEnter={() => setActiveIndex(globalIdx)}
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
                                    ))
                                )}

                                {/* Ask AI item */}
                                {showAiItem && (
                                    <div>
                                        {flatFiltered.length > 0 && (
                                            <div className="mx-4 mt-1 mb-1 border-t border-border/40" />
                                        )}
                                        <button
                                            type="button"
                                            data-active={activeIndex === AI_ITEM_INDEX}
                                            onClick={() => runAiSearch(query.trim())}
                                            onMouseEnter={() => setActiveIndex(AI_ITEM_INDEX)}
                                            className={cn(
                                                "group flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                                                activeIndex === AI_ITEM_INDEX
                                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                    : "text-muted-foreground hover:bg-blue-500/5 hover:text-blue-600 dark:hover:text-blue-400"
                                            )}
                                        >
                                            <Sparkles
                                                className={cn(
                                                    "h-4 w-4 shrink-0 transition-colors",
                                                    activeIndex === AI_ITEM_INDEX
                                                        ? "text-blue-500"
                                                        : "text-muted-foreground/60 group-hover:text-blue-500/70"
                                                )}
                                            />
                                            <span className="flex-1 font-medium">
                                                Ask AI:{" "}
                                                <span className="font-normal opacity-70">{query}</span>
                                            </span>
                                            {activeIndex === AI_ITEM_INDEX && (
                                                <CornerDownLeft className="h-3 w-3 text-blue-500/50" />
                                            )}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── Footer ──────────────────────────── */}
                    <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                            <Sparkles
                                className={cn(
                                    "h-3 w-3",
                                    aiState !== "idle" && "text-blue-500/70"
                                )}
                            />
                            <span>
                                {aiState === "loading"
                                    ? "Taxflow AI is searching..."
                                    : aiState === "done" || aiState === "error"
                                    ? "Taxflow AI"
                                    : "Taxflow AI search"}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50">
                            {aiState === "idle" && query.trim() && (
                                <span className="flex items-center gap-1">
                                    <kbd className="rounded border border-border/60 bg-muted px-1 font-mono text-[10px]">
                                        ⇧↵
                                    </kbd>
                                    ask AI
                                </span>
                            )}
                            {aiState === "idle" && (
                                <>
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
                                </>
                            )}
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
