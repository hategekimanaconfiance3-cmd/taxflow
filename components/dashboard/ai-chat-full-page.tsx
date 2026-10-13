'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Send, Loader2, User, Sparkles, RotateCcw,
  MessageCircle, AlertCircle, Lightbulb, BookOpen,
} from 'lucide-react';
import type { TraderRole } from '@/lib/sidebar-config';

// ---------------------------------------------------------------------------
// Suggestion sets per role
// ---------------------------------------------------------------------------

const SUGGESTIONS: Record<TraderRole, { category: string; queries: string[] }[]> = {
  manufacturer: [
    {
      category: '📊 My Business',
      queries: [
        'Show my dashboard overview',
        'What is my current stock?',
        'Show my recent sales',
        'What is my tax status?',
      ],
    },
    {
      category: '💰 Finance & Tax',
      queries: [
        'How much VAT do I owe?',
        'Show my monthly sales trend',
        'How is VAT calculated in Rwanda?',
        'What are my confirmed transactions?',
      ],
    },
    {
      category: '❓ Platform Help',
      queries: [
        'How do I sell to a wholesaler?',
        'How do I record production?',
        'How do I file a dispute?',
        'How do I export my report?',
      ],
    },
  ],
  wholesaler: [
    {
      category: '📊 My Business',
      queries: [
        'Show my dashboard overview',
        "What's my current inventory?",
        'Show my recent purchases',
        'What is my tax status?',
      ],
    },
    {
      category: '💰 Finance & Tax',
      queries: [
        'How much VAT do I owe?',
        'Show my sales this month',
        'What is my outstanding tax balance?',
        'Show my confirmed transactions',
      ],
    },
    {
      category: '❓ Platform Help',
      queries: [
        'How do I confirm a transaction?',
        'How do I sell to a retailer?',
        'How do I file a dispute?',
        'How do I view pending transactions?',
      ],
    },
  ],
  retailer: [
    {
      category: '📊 My Business',
      queries: [
        'Show my dashboard overview',
        "What's my current stock?",
        'Show my recent sales',
        'What is my tax status?',
      ],
    },
    {
      category: '💰 Finance & Tax',
      queries: [
        'How much VAT do I owe?',
        'Why is my VAT higher this month?',
        'What is my outstanding tax balance?',
        'Show my payment history',
      ],
    },
    {
      category: '❓ Platform Help',
      queries: [
        'How do I record a sale?',
        'How do I file a dispute?',
        'How do I make a tax payment?',
        'How do I export my tax report?',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Markdown-to-HTML renderer (lightweight, no external deps)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]?.includes('|') && lines[i]?.trim().startsWith('|')) {
        tableLines.push(lines[i]!);
        i++;
      }
      const dataRows = tableLines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l.trim()));
      if (dataRows.length > 0) {
        const parse = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim());
        const header = parse(dataRows[0]!).map((c) => `<th class="px-3 py-1.5 text-left font-semibold text-xs border-b bg-muted/40">${fmt(c)}</th>`).join('');
        const body = dataRows.slice(1).map((r) => `<tr class="border-b border-border/40 last:border-0">${parse(r).map((c) => `<td class="px-3 py-1.5 text-xs">${fmt(c)}</td>`).join('')}</tr>`).join('');
        result.push(`<div class="overflow-x-auto my-2 rounded-lg border"><table class="w-full"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`);
      }
      continue;
    }

    // Headings
    if (line.startsWith('### ')) { result.push(`<h4 class="font-semibold text-sm mt-3 mb-1">${fmt(line.slice(4))}</h4>`); }
    else if (line.startsWith('## ')) { result.push(`<h3 class="font-semibold text-[15px] mt-3 mb-1">${fmt(line.slice(3))}</h3>`); }
    else if (line.startsWith('# '))  { result.push(`<h2 class="font-bold text-base mt-3 mb-1">${fmt(line.slice(2))}</h2>`); }

    // Lists
    else if (/^[-*]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i]?.trim() ?? '')) {
        items.push(lines[i]!.trim().replace(/^[-*]\s/, ''));
        i++;
      }
      result.push(`<ul class="list-disc list-inside space-y-0.5 my-1 ml-1">${items.map((it) => `<li class="text-sm">${fmt(it)}</li>`).join('')}</ul>`);
      continue;
    }
    else if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]?.trim() ?? '')) {
        items.push(lines[i]!.trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      result.push(`<ol class="list-decimal list-inside space-y-0.5 my-1 ml-1">${items.map((it) => `<li class="text-sm">${fmt(it)}</li>`).join('')}</ol>`);
      continue;
    }
    else if (/^---+$/.test(line.trim())) { result.push('<hr class="my-2 border-border" />'); }
    else if (line.trim() === '')         { result.push('<div class="h-1" />'); }
    else                                 { result.push(`<p class="text-sm leading-relaxed my-0.5">${fmt(line)}</p>`); }

    i++;
  }

  return result.join('');
}

function fmt(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-xs font-mono">$1</code>');
}

// ---------------------------------------------------------------------------
// Main Chat Component
// ---------------------------------------------------------------------------

interface AIChatFullPageProps {
  role: TraderRole;
  businessName: string;
}

export function AIChatFullPage({ role, businessName }: AIChatFullPageProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/ai/query' }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';
  const suggestions = SUGGESTIONS[role] ?? SUGGESTIONS.retailer;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = input.trim();
      if (!q || isLoading) return;
      sendMessage({ text: q });
      setInput('');
    },
    [input, isLoading, sendMessage],
  );

  const handleSuggestion = useCallback(
    (q: string) => {
      sendMessage({ text: q });
      inputRef.current?.focus();
    },
    [sendMessage],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-112px)] flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0 bg-background">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/15 to-violet-500/15 border">
            <Brain className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">TaxFlow AI Assistant</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Answering from your verified records · {businessName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50">
            Read-only · Secure
          </Badge>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => setMessages([])}
            >
              <RotateCcw className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* Empty state with categorised suggestions */
          <div className="mx-auto max-w-2xl px-6 py-8 space-y-8">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-violet-500/10 border">
                <Sparkles className="h-8 w-8 text-blue-500" />
              </div>
              <h2 className="text-lg font-semibold">Ask about your business</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Get instant, accurate answers about your sales, stock, tax status, and more —
                grounded in your real data.
              </p>
            </div>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                The AI can only access <strong>your own business data</strong>. All answers are
                read-only and grounded in verified database records. Never share passwords or
                confidential information.
              </p>
            </div>

            {/* Suggestion categories */}
            <div className="grid gap-4 sm:grid-cols-3">
              {suggestions.map((group) => (
                <div key={group.category} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{group.category}</p>
                  <div className="space-y-1.5">
                    {group.queries.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSuggestion(q)}
                        className="w-full text-left rounded-lg border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                      >
                        <MessageCircle className="h-3 w-3 inline mr-1.5 opacity-40" />
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-6 py-4 space-y-4">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isLast = idx === messages.length - 1;
              const isStreamingThis = isLast && isLoading && !isUser;

              const textContent = msg.parts
                ?.filter((p) => p.type === 'text')
                .map((p) => (p as { type: 'text'; text: string }).text)
                .join('') ?? '';

              const hasToolCall = msg.parts?.some(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (p: any) => typeof p.type === 'string' && p.type.startsWith('tool-'),
              );

              /* User bubble */
              if (isUser) {
                return (
                  <div key={msg.id} className="flex gap-3 justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2.5 bg-foreground text-background text-sm leading-relaxed">
                      {textContent}
                    </div>
                    <div className="shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  </div>
                );
              }

              /* Assistant — still querying DB */
              if (!textContent && isStreamingThis) {
                return (
                  <div key={msg.id} className="flex gap-3">
                    <div className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 border flex items-center justify-center">
                      <Brain className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="rounded-2xl rounded-bl-sm border bg-muted/40 px-4 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {hasToolCall ? 'Querying your data…' : 'Thinking…'}
                      </div>
                    </div>
                  </div>
                );
              }

              /* Assistant — has text */
              if (textContent) {
                return (
                  <div key={msg.id} className="flex gap-3">
                    <div className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 border flex items-center justify-center mt-0.5">
                      <Brain className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border bg-muted/30 px-4 py-3">
                      <div
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }}
                        className="[&_strong]:text-foreground [&_code]:text-foreground"
                      />
                      {isStreamingThis && (
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse ml-1 align-middle" />
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* Global loading indicator */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3">
                <div className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 border flex items-center justify-center">
                  <Brain className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="rounded-2xl rounded-bl-sm border bg-muted/40 px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking…
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t bg-background px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-2">
          <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-xl border bg-muted/20 px-4 py-2.5 focus-within:border-blue-400 transition-colors">
            <Brain className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your sales, stock, tax status…"
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="h-7 w-7 shrink-0 rounded-lg"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </form>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
            <span className="flex items-center gap-1">
              <Lightbulb className="h-2.5 w-2.5" />
              Answers are grounded in your verified records. Never fabricated.
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-2.5 w-2.5" />
              Press <kbd className="px-1 py-0.5 rounded border text-[9px] font-mono bg-muted">Ctrl I</kbd> to toggle sidebar panel
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
