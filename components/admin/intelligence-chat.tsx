"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIFeedbackControl } from "@/components/admin/ai-feedback-control";
import type { RRAAIToolName } from "@/lib/ai/rra-tool-access";
import {
    Brain,
    Send,
    Loader2,
    User,
    Sparkles,
    RotateCcw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// RRA Intelligence Chat — Natural language interface for tax officers
// ---------------------------------------------------------------------------

const SUGGESTIONS_BY_TOOL: Partial<Record<RRAAIToolName, string>> = {
    getTaxpayerIntelligence: "Summarize the authorized records for TIN 100000001",
    lookupTrader: "Find the taxpayer with TIN 100000001",
    searchTraders: "Find registered manufacturers",
    getTransactions: "Show today's transactions",
    getStockLevels: "Show current stock for TIN 100000001",
    getStockMovements: "Why did stock change for TIN 100000001?",
    getTaxStatus: "Explain the tax status for TIN 100000001",
    getRiskAssessment: "Show potential risk indicators for TIN 100000001",
    getRevenueForecastTool: "Compare the revenue forecast with recent results",
    getSystemStats: "Summarize current system statistics",
    getBehavioralAnalysis: "Explain recent activity patterns for TIN 100000001",
    traceSupplyChain: "Trace the supply chain for Cement",
    traceProductJourney: "Trace the recorded journey for Cement",
    getImportDeclarations: "Find import declarations for customs reference CUS-2026-0104",
};

export function IntelligenceChat({ authorizedTools }: { authorizedTools: readonly RRAAIToolName[] }) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const suggestedQueries = [...new Set(authorizedTools.flatMap((toolName) => {
        const suggestion = SUGGESTIONS_BY_TOOL[toolName];
        return suggestion ? [suggestion] : [];
    }))].slice(0, 6);

    const { messages, sendMessage, status, setMessages, error } = useChat({
        transport: new DefaultChatTransport({ api: "/api/ai/query" }),
    });

    const isLoading = status === "streaming" || status === "submitted";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage({ text: input.trim() });
        setInput("");
    };

    const handleSuggestion = (query: string) => {
        sendMessage({ text: query });
    };

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <Card className="flex flex-col h-[calc(100vh-12rem)]">
            <CardHeader className="pb-3 border-b shrink-0">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Taxflow AI Intelligence
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-medium">
                        Role-aware · Read-only
                    </span>
                </CardTitle>
                <p className="mt-2 text-xs text-muted-foreground">AI findings are advisory and require human review. Only authorized RRA employees make official decisions; the assistant cannot execute them.</p>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Empty state */}
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full space-y-6">
                        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border">
                            <Sparkles className="h-8 w-8 text-blue-500" />
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="font-semibold text-lg">
                                Ask about authorized TaxFlow data or workflows
                            </h3>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Your verified RRA permissions control which records the assistant can search.
                            </p>
                        </div>
                        {suggestedQueries.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                            {suggestedQueries.map((q) => (
                                <button
                                    key={q}
                                    onClick={() => handleSuggestion(q)}
                                    className="text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>}
                    </div>
                )}

                {/* Messages */}
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                    >
                        {msg.role === "assistant" && (
                            <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                                <Brain className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                        )}
                        <div
                            className={`rounded-xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed ${
                                msg.role === "user"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted/50 border"
                            }`}
                        >
                            {msg.parts.map((part, i) => {
                                if (part.type === "text") {
                                    return (
                                        <div
                                            key={`${msg.id}-${i}`}
                                            className="whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none"
                                            dangerouslySetInnerHTML={{
                                                __html: formatMessage(part.text),
                                            }}
                                        />
                                    );
                                }
                                if (part.type.startsWith("tool-")) return null;
                                return null;
                            })}
                            {msg.role === "assistant" && status === "ready" && msg.parts.some((part) => part.type === "text") && (
                                <AIFeedbackControl messageId={msg.id} />
                            )}
                        </div>
                        {msg.role === "user" && (
                            <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-3.5 w-3.5" />
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex gap-3">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center">
                            <Brain className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <div className="bg-muted/50 border rounded-xl px-4 py-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Analyzing data…
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {error.message || "The AI assistant could not complete this request. Please try again."}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </CardContent>

            {/* Input area */}
            <div className="border-t p-4 shrink-0">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about traders, transactions, tax data…"
                        className="flex-1"
                        disabled={isLoading}
                    />
                    <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                    {messages.length > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setMessages([])}
                            title="Clear chat"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    )}
                </form>
                <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    AI responses are generated from live platform data and may contain errors. Always verify critical decisions.
                </p>
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Simple markdown-like formatting for AI responses
// ---------------------------------------------------------------------------

function formatMessage(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        // Bold
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        // Inline code
        .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-xs">$1</code>')
        // Line breaks
        .replace(/\n/g, "<br/>");
}

