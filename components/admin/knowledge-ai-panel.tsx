"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, ChevronDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
    role: "user" | "assistant";
    content: string;
}

interface KnowledgeAIPanelProps {
    /** Optional section slug to scope article context (e.g. "compliance", "imports") */
    section?: string;
    className?: string;
}

// ---------------------------------------------------------------------------
// Suggested questions
// ---------------------------------------------------------------------------

const SUGGESTED_QUESTIONS = [
    "How does the 95% tax compliance rule work?",
    "How is the stock movement percentage calculated?",
    "What is the responsibility of a Customs officer?",
    "How does import verification work?",
    "What happens when a trader is flagged by AI?",
    "How does TaxFlow track goods through the supply chain?",
];

// ---------------------------------------------------------------------------
// Simple markdown renderer (bold, code, lists, headings)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string) {
    const lines = text.split("\n");
    return lines.map((line, i) => {
        // Heading
        if (line.startsWith("### ")) return <h4 key={i} className="font-semibold mt-3 mb-1 text-sm">{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={i} className="font-semibold mt-3 mb-1 text-sm">{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={i} className="font-bold mt-3 mb-1 text-sm">{line.slice(2)}</h2>;
        // Bullet
        if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
                <div key={i} className="flex gap-1.5 my-0.5">
                    <span className="text-muted-foreground mt-1">•</span>
                    <span>{inlineMd(line.slice(2))}</span>
                </div>
            );
        }
        // Numbered
        if (/^\d+\.\s/.test(line)) {
            const match = line.match(/^(\d+)\.\s(.*)/);
            if (match) {
                return (
                    <div key={i} className="flex gap-1.5 my-0.5">
                        <span className="text-muted-foreground font-mono text-xs mt-0.5 w-4 shrink-0">{match[1]}.</span>
                        <span>{inlineMd(match[2])}</span>
                    </div>
                );
            }
        }
        // Empty line
        if (!line.trim()) return <div key={i} className="h-2" />;
        // Normal paragraph
        return <p key={i} className="my-0.5 leading-relaxed">{inlineMd(line)}</p>;
    });
}

function inlineMd(text: string) {
    // Bold (**text**)
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={i} className="bg-muted px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
        }
        return part;
    });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeAIPanel({ section, className }: KnowledgeAIPanelProps) {
    const [messages, setMessages] = React.useState<Message[]>([]);
    const [input, setInput] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = React.useState(true);
    const bottomRef = React.useRef<HTMLDivElement>(null);

    // Scroll to bottom whenever messages update
    React.useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendQuestion = React.useCallback(async (question: string) => {
        if (!question.trim() || isLoading) return;

        setShowSuggestions(false);
        setError(null);
        setMessages((prev) => [...prev, { role: "user", content: question }]);
        setInput("");
        setIsLoading(true);

        // Optimistically add a streaming assistant placeholder
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        try {
            const response = await fetch("/api/knowledge/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question, section }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error ?? `Request failed with status ${response.status}`);
            }

            if (!response.body) throw new Error("No response stream received.");

            // Stream the response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: "assistant",
                        content: accumulatedText,
                    };
                    return updated;
                });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unexpected error occurred.";
            setError(message);
            // Remove the empty assistant placeholder on error
            setMessages((prev) => prev.slice(0, -1));
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, section]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendQuestion(input);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendQuestion(input);
        }
    };

    return (
        <Card className={cn("flex flex-col h-full border-border/60", className)}>
            <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Ask TaxFlow AI
                    <Badge variant="secondary" className="text-xs font-normal ml-auto">
                        Beta
                    </Badge>
                </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col flex-1 gap-3 p-0 overflow-hidden">
                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-4 pt-3">
                    {messages.length === 0 && showSuggestions && (
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground mb-3">
                                Ask a question about TaxFlow features, policies, or processes.
                            </p>
                            <div className="grid gap-1.5">
                                {SUGGESTED_QUESTIONS.map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => sendQuestion(q)}
                                        className="text-left text-xs px-3 py-2 rounded-lg border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4 pb-2">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex gap-2",
                                    msg.role === "user" ? "justify-end" : "justify-start",
                                )}
                            >
                                {msg.role === "assistant" && (
                                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                )}
                                <div
                                    className={cn(
                                        "max-w-[85%] rounded-xl px-3 py-2 text-xs",
                                        msg.role === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-foreground",
                                    )}
                                >
                                    {msg.role === "assistant" ? (
                                        msg.content
                                            ? renderMarkdown(msg.content)
                                            : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                    ) : (
                                        <span>{msg.content}</span>
                                    )}
                                </div>
                            </div>
                        ))}

                        {error && (
                            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>
                </div>

                {/* Suggestions toggle when there are messages */}
                {messages.length > 0 && (
                    <div className="px-4">
                        <button
                            onClick={() => setShowSuggestions((v) => !v)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ChevronDown className={cn("h-3 w-3 transition-transform", showSuggestions && "rotate-180")} />
                            {showSuggestions ? "Hide" : "Show"} suggested questions
                        </button>
                        {showSuggestions && (
                            <div className="mt-2 grid gap-1">
                                {SUGGESTED_QUESTIONS.map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => sendQuestion(q)}
                                        disabled={isLoading}
                                        className="text-left text-xs px-2.5 py-1.5 rounded-md border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Input area */}
                <div className="px-4 pb-4 space-y-2">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about TaxFlow features, policies, or rules…"
                            className="min-h-[60px] max-h-[120px] text-xs resize-none"
                            disabled={isLoading}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!input.trim() || isLoading}
                            className="shrink-0 self-end h-9 w-9"
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </form>

                    {/* Disclaimer */}
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                        AI answers are based on TaxFlow documentation. For official decisions, consult authorized RRA procedures.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

export default KnowledgeAIPanel;
