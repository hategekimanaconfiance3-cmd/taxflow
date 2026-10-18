'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { DashboardSidebar } from '@/components/dashboard/sidebar/sidebar';
import { DashboardTopbar } from '@/components/dashboard/topbar/topbar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Brain, Send, Sparkles, RotateCcw, X, Check, Loader2, ChevronDown,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { cn } from '@/lib/utils';
import type { TraderRole } from '@/lib/sidebar-config';
import { LANGS, translate, type LangCode } from '@/lib/language';
import { useLanguagePreference } from '@/lib/use-language';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SIDEBAR_FULL_W = 260;
const SIDEBAR_ICON_W = 64;
const AI_PANEL_W = 420;


const SUGGESTIONS: Record<string, string[]> = {
  manufacturer: [
    'Show my recent sales',
    "What's my current stock?",
    'What is my tax status?',
    'How do I sell to a wholesaler?',
  ],
  wholesaler: [
    'Show my recent purchases',
    "What's my current inventory?",
    'How much VAT do I owe?',
    'How do I confirm a transaction?',
  ],
  retailer: [
    'Show my recent sales',
    "What's my current stock?",
    'Why is my VAT higher this month?',
    'How do I file a dispute?',
  ],
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface DashboardLayoutContextValue {
  isSidebarCollapsed: boolean;
  isAiOpen: boolean;
  lang: LangCode;
  sidebarW: number;
  openAI: () => void;
  closeAI: () => void;
  expandSidebar: () => void;
  setLang: (l: LangCode) => void;
}

const DashboardLayoutContext = createContext<DashboardLayoutContextValue | null>(null);

export function useDashboardLayoutCtx(): DashboardLayoutContextValue {
  const ctx = useContext(DashboardLayoutContext);
  if (!ctx) throw new Error('useDashboardLayoutCtx must be used within DashboardLayoutClient');
  return ctx;
}

// ---------------------------------------------------------------------------
// Language Selector
// ---------------------------------------------------------------------------
export function LangSelector({ value, onChange }: { value: LangCode; onChange: (l: LangCode) => void }) {
  const current = LANGS.find((l) => l.code === value)!;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="font-semibold tracking-wide">{current.label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {translate('Language', value)}
        </p>
        {LANGS.map((lang) => (
          <button
            key={lang.code}
            onClick={() => onChange(lang.code)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-2">
              <span className="w-8 text-[11px] font-bold text-muted-foreground">{lang.label}</span>
              <span className="text-foreground">{lang.full}</span>
            </div>
            {value === lang.code && <Check className="h-3.5 w-3.5 text-blue-500" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// AI Side Panel
// ---------------------------------------------------------------------------
function AIPanel({ onClose, role }: { onClose: () => void; role: TraderRole }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/ai/query' }),
  });
  const isLoading = status === 'streaming' || status === 'submitted';
  const suggestions = SUGGESTIONS[role] ?? SUGGESTIONS.retailer;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage({ text: input.trim() });
      setInput('');
    },
    [input, isLoading, sendMessage],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-violet-500/15 border">
            <Brain className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-none">Ask AI</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">TaxFlow Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMessages([])} title="Clear">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 pb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-gradient-to-br from-blue-500/10 to-violet-500/10">
              <Sparkles className="h-7 w-7 text-blue-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">Ask about your taxes &amp; business</p>
              <p className="text-xs text-muted-foreground">Get instant answers about compliance &amp; stock</p>
            </div>
            <div className="w-full space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage({ text: s })}
                  className="w-full rounded-lg border px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isStreaming = i === messages.length - 1 && isLoading && !isUser;
            const content = msg.parts
              ?.filter((p) => p.type === 'text')
              .map((p) => (p as { type: 'text'; text: string }).text)
              .join('') ?? '';
            return (
              <div key={msg.id} className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
                {!isUser && (
                  <div className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 border flex items-center justify-center mt-0.5">
                    <Brain className="h-3 w-3 text-blue-600" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-[13px]',
                    isUser
                      ? 'bg-foreground text-background rounded-br-sm'
                      : 'bg-muted/60 text-foreground rounded-bl-sm',
                  )}
                >
                  {isStreaming && !content ? (
                    <div className="flex gap-1 items-center py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="h-7 w-7 shrink-0"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Tip: Press <kbd className="rounded border px-1 font-mono text-[9px]">Ctrl</kbd>{' '}
          <kbd className="rounded border px-1 font-mono text-[9px]">I</kbd> to toggle
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardLayoutClient — wraps sidebar + topbar + main + AI panel
// ---------------------------------------------------------------------------
interface DashboardLayoutClientProps {
  role: TraderRole;
  userName: string;
  businessName: string;
  userId: string;
  children: ReactNode;
}

export function DashboardLayoutClient({
  role,
  userName,
  businessName,
  userId,
  children,
}: DashboardLayoutClientProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [lang, setLang] = useLanguagePreference();

  const openAI = useCallback(() => {
    setIsAiOpen(true);
    setIsSidebarCollapsed(true);
  }, []);

  const closeAI = useCallback(() => {
    setIsAiOpen(false);
    setIsSidebarCollapsed(false);
  }, []);

  const toggleAI = useCallback(() => {
    if (isAiOpen) closeAI(); else openAI();
  }, [isAiOpen, openAI, closeAI]);

  const expandSidebar = useCallback(() => {
    if (isAiOpen) setIsAiOpen(false);
    setIsSidebarCollapsed(false);
  }, [isAiOpen]);

  // Ctrl+I shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        toggleAI();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleAI]);

  const sidebarW = isSidebarCollapsed ? SIDEBAR_ICON_W : SIDEBAR_FULL_W;

  return (
    <DashboardLayoutContext.Provider
      value={{ isSidebarCollapsed, isAiOpen, lang, sidebarW, openAI, closeAI, expandSidebar, setLang }}
    >
      <DashboardSidebar role={role} businessName={businessName} userName={userName} />

      <div
        className="flex min-h-screen flex-col transition-[padding] duration-300"
        style={{
          paddingLeft: `${sidebarW}px`,
          paddingRight: isAiOpen ? `${AI_PANEL_W}px` : '0px',
        }}
      >
        <DashboardTopbar role={role} userName={userName} businessName={businessName} userId={userId} />
        <main className="flex-1">
          <div className="p-6">{children}</div>
        </main>
      </div>

      {isAiOpen && (
        <div
          className="fixed top-0 right-0 bottom-0 z-40 flex flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right-4 fade-in duration-200"
          style={{ width: AI_PANEL_W }}
        >
          <AIPanel onClose={closeAI} role={role} />
        </div>
      )}
    </DashboardLayoutContext.Provider>
  );
}
