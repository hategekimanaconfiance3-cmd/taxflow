"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Brain,
    Send,
    Loader2,
    User,
    Sparkles,
    X,
    RotateCcw,
    MessageCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// AI Chat Widget — Floating panel for all dashboards.
// Adapts suggested queries based on user role.
// ---------------------------------------------------------------------------

interface AIChatWidgetProps {
    role: string;
}

const SUGGESTIONS: Record<string, string[]> = {
    rra_staff: [
        "Show system-wide statistics",
        // "Which traders have high risk scores?",
        "Trace the supply chain for Rice",
        "Show pending transaction confirmations",
        "Generate revenue forecast for 6 months",
        "Get audit summary for TIN 100000001",
    ],
    manufacturer: [
        "Show my recent sales",
        "What's my current stock?",
        "How is VAT calculated?",
        "What is my tax status?",
        "How do I sell to a wholesaler?",
        "Show my business profile",
    ],
    wholesaler: [
        "Show my recent purchases",
        "What's my current inventory?",
        "How much VAT do I owe?",
        "Show my sales this week",
        "How do I confirm a transaction?",
        "How do I record a sale?",
    ],
    retailer: [
        "Show my recent sales",
        "What's my current stock?",
        "Why is my VAT higher this month?",
        "How do I record a sale?",
        "What is my tax status?",
        "How do I file a dispute?",
    ],
};

export function AIChatWidget({ role }: AIChatWidgetProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { messages, sendMessage, status, setMessages } = useChat({
        transport: new DefaultChatTransport({ api: "/api/ai/query" }),
    });

    const isLoading = status === "streaming" || status === "submitted";
    const suggestions = SUGGESTIONS[role] ?? SUGGESTIONS.retailer;

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (!input.trim() || isLoading) return;
            sendMessage({ text: input.trim() });
            setInput("");
        },
        [input, isLoading, sendMessage],
    );

    const handleSuggestion = useCallback(
        (query: string) => {
            sendMessage({ text: query });
        },
        [sendMessage],
    );

    // Auto-scroll on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, []);

    return (
        <>
            {/* Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-emerald-600 px-4 py-3 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 group"
                    title="Open AI Chat"
                >
                    <Brain className="h-5 w-5" />
                    <span className="text-sm font-medium hidden sm:inline">Ask AI</span>
                    {messages.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[10px] flex items-center justify-center font-bold">
                            {messages.filter((m) => m.role === "assistant").length}
                        </span>
                    )}
                </button>
            )}

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-4rem)] flex flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-600/5 to-emerald-600/5 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                                <Brain className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold">Taxflow AI</h3>
                                <p className="text-[10px] text-muted-foreground">
                                    {role === "rra_staff"
                                        ? "RRA Intelligence Assistant"
                                        : "Your Business Assistant"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {messages.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full"
                                    onClick={() => setMessages([])}
                                    title="Clear chat"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full"
                                onClick={() => setIsOpen(false)}
                                title="Close (Esc)"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {/* Empty state */}
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full space-y-5">
                                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border">
                                    <Sparkles className="h-7 w-7 text-blue-500" />
                                </div>
                                <div className="text-center space-y-1.5">
                                    <h4 className="font-semibold text-sm">
                                        {role === "rra_staff"
                                            ? "Ask about traders, risk, and revenue"
                                            : "Ask about your business data"}
                                    </h4>
                                    <p className="text-xs text-muted-foreground max-w-[280px]">
                                        {role === "rra_staff"
                                            ? "Query any trader, trace supply chains, check risk scores, and get revenue forecasts."
                                            : "View your sales, stock, tax status, and get help using the platform."}
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 gap-1.5 w-full max-w-xs">
                                    {suggestions.slice(0, 4).map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => handleSuggestion(q)}
                                            className="text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                                        >
                                            <MessageCircle className="h-3 w-3 inline mr-1.5 opacity-40" />
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Chat messages */}
                        {messages.map((msg, msgIdx) => {
                            const isLastMessage = msgIdx === messages.length - 1;
                            const isStreamingThis = isLastMessage && isLoading && msg.role === "assistant";

                            // Check content types — exclude "reasoning" parts (chain-of-thought from deepseek-reasoner)
                            const hasText = msg.parts.some(
                                (p) => p.type === "text" && p.text.trim().length > 0,
                            );
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const hasToolInvocation = msg.parts.some(
                                (p: any) => typeof p.type === "string" && p.type.startsWith("tool-"),
                            );
                            const hasOnlyReasoning = !hasText && !hasToolInvocation && msg.parts.some(
                                (p) => p.type === "reasoning",
                            );

                            // User messages — always render
                            if (msg.role === "user") {
                                return (
                                    <div key={msg.id} className="flex gap-2.5 justify-end">
                                        <div className="rounded-xl px-3.5 py-2 max-w-[82%] text-[13px] leading-relaxed bg-primary text-primary-foreground">
                                            {msg.parts.map((part, i) =>
                                                part.type === "text" ? (
                                                    <span key={`${msg.id}-${i}`}>{part.text}</span>
                                                ) : null,
                                            )}
                                        </div>
                                        <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                            <User className="h-3 w-3" />
                                        </div>
                                    </div>
                                );
                            }

                            // Assistant: streaming with no visible content yet (or only reasoning) → "Analyzing..."
                            if (!hasText && !hasToolInvocation && isStreamingThis) {
                                return (
                                    <div key={msg.id} className="flex gap-2.5">
                                        <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                                            <Brain className="h-3 w-3 text-blue-600" />
                                        </div>
                                        <div className="bg-muted/50 border rounded-xl px-3.5 py-2.5">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                Thinking…
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Assistant: only tool invocations, no text yet (still loading) → show tool status
                            if (!hasText && hasToolInvocation && isStreamingThis) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const toolParts = msg.parts.filter((p: any) => p.type?.startsWith?.("tool-"));
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const latestTool = toolParts[toolParts.length - 1] as any;
                                const toolDisplayName = latestTool?.toolName
                                    ? formatToolName(latestTool.toolName)
                                    : "";
                                return (
                                    <div key={msg.id} className="flex gap-2.5">
                                        <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                                            <Brain className="h-3 w-3 text-blue-600" />
                                        </div>
                                        <div className="bg-muted/50 border rounded-xl px-3.5 py-2.5">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span>
                                                    Querying data{toolDisplayName ? ` — ${toolDisplayName}` : ""}…
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Assistant: only tool invocations, no text, done streaming → empty response fallback
                            if (!hasText && hasToolInvocation && !isLoading) {
                                return (
                                    <div key={msg.id} className="flex gap-2.5">
                                        <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center mt-0.5">
                                            <Brain className="h-3 w-3 text-blue-600" />
                                        </div>
                                        <div className="bg-muted/50 border rounded-xl px-3.5 py-2 max-w-[82%] text-[13px] leading-relaxed">
                                            <p className="text-muted-foreground italic">
                                                The data was retrieved but the AI couldn&apos;t generate a summary. Please try rephrasing your question.
                                            </p>
                                        </div>
                                    </div>
                                );
                            }

                            // Assistant: completely empty or only reasoning, done streaming → skip or show fallback 
                            if (!hasText && !hasToolInvocation && !isLoading) {
                                if (hasOnlyReasoning) {
                                    return (
                                        <div key={msg.id} className="flex gap-2.5">
                                            <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center mt-0.5">
                                                <Brain className="h-3 w-3 text-blue-600" />
                                            </div>
                                            <div className="bg-muted/50 border rounded-xl px-3.5 py-2 max-w-[82%] text-[13px] leading-relaxed">
                                                <p className="text-muted-foreground italic">
                                                    Analysis completed but no summary was generated. Please try again.
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }

                            // Assistant: has text → render normally
                            return (
                                <div key={msg.id} className="flex gap-2.5">
                                    <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center mt-0.5">
                                        <Brain className="h-3 w-3 text-blue-600" />
                                    </div>
                                    <div className="rounded-xl px-3.5 py-2 max-w-[82%] text-[13px] leading-relaxed bg-muted/50 border">
                                        {msg.parts.map((part, i) => {
                                            if (part.type === "text" && part.text.trim()) {
                                                return (
                                                    <div
                                                        key={`${msg.id}-${i}`}
                                                        className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-0.5 [&>ul]:my-1 [&>ol]:my-1 [&>table]:my-2 [&_strong]:text-foreground"
                                                        dangerouslySetInnerHTML={{
                                                            __html: formatMessage(part.text),
                                                        }}
                                                    />
                                                );
                                            }
                                            return null;
                                        })}
                                        {/* Streaming dot */}
                                        {isStreamingThis && hasText && (
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse ml-1 align-middle" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Loading indicator — only when NO assistant message exists yet */}
                        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
                            <div className="flex gap-2.5">
                                <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                                    <Brain className="h-3 w-3 text-blue-600" />
                                </div>
                                <div className="bg-muted/50 border rounded-xl px-3.5 py-2.5">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Thinking…
                                    </div>
                                </div>
                            </div>
                        )}


                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t p-3 shrink-0">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={
                                    role === "rra_staff"
                                        ? "Ask about traders, tax, risk…"
                                        : "Ask about your sales, stock, tax…"
                                }
                                className="flex-1 h-9 text-sm"
                                disabled={isLoading}
                                autoFocus
                            />
                            <Button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                size="icon"
                                className="h-9 w-9 shrink-0"
                            >
                                {isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </form>
                        <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
                            AI responses are generated from live data and may contain errors.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Markdown renderer — converts AI markdown to styled HTML
// Handles: tables, bold, italic, code, lists, headers, horizontal rules
// ---------------------------------------------------------------------------

/** Convert camelCase tool names to readable labels */
function formatToolName(name: string): string {
    return name
        .replace(/^get/, "")
        .replace(/([A-Z])/g, " $1")
        .replace(/^\s+/, "")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase());
}

function formatMessage(text: string): string {
    const lines = text.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        // Detect markdown table (line with |)
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

        // Headers
        if (line.startsWith("### ")) {
            result.push(`<h4 class="font-semibold text-[13px] mt-2 mb-0.5">${formatInline(line.slice(4))}</h4>`);
        } else if (line.startsWith("## ")) {
            result.push(`<h3 class="font-semibold text-sm mt-2 mb-0.5">${formatInline(line.slice(3))}</h3>`);
        } else if (line.startsWith("# ")) {
            result.push(`<h3 class="font-bold text-sm mt-2 mb-0.5">${formatInline(line.slice(2))}</h3>`);
        }
        // Unordered list items
        else if (/^[-*]\s/.test(line.trim())) {
            const items: string[] = [];
            while (i < lines.length && /^[-*]\s/.test(lines[i]?.trim() ?? "")) {
                items.push(lines[i]!.trim().replace(/^[-*]\s/, ""));
                i++;
            }
            result.push(
                `<ul class="list-disc list-inside space-y-0.5 my-1">${items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ul>`,
            );
            continue;
        }
        // Ordered list items
        else if (/^\d+\.\s/.test(line.trim())) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i]?.trim() ?? "")) {
                items.push(lines[i]!.trim().replace(/^\d+\.\s/, ""));
                i++;
            }
            result.push(
                `<ol class="list-decimal list-inside space-y-0.5 my-1">${items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</ol>`,
            );
            continue;
        }
        // Horizontal rule
        else if (/^---+$/.test(line.trim())) {
            result.push('<hr class="my-2 border-border" />');
        }
        // Empty line
        else if (line.trim() === "") {
            result.push("<br/>");
        }
        // Regular text
        else {
            result.push(`<p class="my-0.5">${formatInline(line)}</p>`);
        }

        i++;
    }

    return result.join("");
}

/** Format inline markdown: bold, italic, code, links */
function formatInline(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">$1</code>');
}

/** Render a markdown table as an HTML table */
function renderTable(lines: string[]): string {
    // Filter out separator rows (|---|---|)
    const dataRows = lines.filter((line) => !/^\|[\s-:|]+\|$/.test(line.trim()));

    if (dataRows.length === 0) return "";

    const parseRow = (line: string): string[] =>
        line
            .split("|")
            .slice(1, -1) // remove empty first/last from leading/trailing |
            .map((cell) => cell.trim());

    const headerCells = parseRow(dataRows[0]!);
    const bodyRows = dataRows.slice(1).map(parseRow);

    const headerHtml = headerCells
        .map((cell) => `<th class="px-2 py-1 text-left font-semibold text-[11px] border-b border-border bg-muted/50">${formatInline(cell)}</th>`)
        .join("");

    const bodyHtml = bodyRows
        .map(
            (row) =>
                `<tr class="border-b border-border/50 last:border-0">${row.map((cell) => `<td class="px-2 py-1 text-[11px]">${formatInline(cell)}</td>`).join("")}</tr>`,
        )
        .join("");

    return `<div class="overflow-x-auto my-2 rounded-lg border border-border"><table class="w-full"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}
