"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AlertCircle,
    CheckCircle2,
    ChevronRight,
    Clock,
    HelpCircle,
    Loader2,
    RefreshCw,
    Send,
    Sparkles,
    User,
    X,
} from "lucide-react";
import {
    assignTicket,
    getTicketDetail,
    reopenTicket,
    resolveTicket,
    replyToTicket,
} from "@/lib/actions/admin-support-ticket.action";
import { improveReply } from "@/lib/actions/improve-reply.action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TicketRow = {
    id: string;
    traderName: string | null;
    traderId: string;
    category: string | null;
    subject: string;
    status: string;
    priority: string | null;
    createdAt: Date | null;
    resolvedAt: Date | null;
};

type TicketDetail = {
    id: string;
    traderId: string;
    traderName: string | null;
    traderEmail: string;
    traderTin: string | null;
    category: string | null;
    subject: string;
    description: string | null;
    status: string;
    priority: string | null;
    assignedToId: string | null;
    resolution: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    resolvedAt: Date | null;
};

type StaffMember = {
    userId: string;
    staffId: string;
    department: string | null;
    name: string;
    role: string;
};

type AiState = "idle" | "loading" | "preview" | "error";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
    open: "bg-amber-100 text-amber-700",
    in_progress: "bg-blue-100 text-blue-700",
    resolved: "bg-emerald-100 text-emerald-700",
    closed: "bg-zinc-100 text-zinc-600",
};

const PRIORITY_COLORS: Record<string, string> = {
    low: "bg-zinc-100 text-zinc-600",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
    return (
        <Badge
            variant="secondary"
            className={`text-[10px] capitalize ${STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-600"}`}
        >
            {status.replace(/_/g, " ")}
        </Badge>
    );
}

function PriorityBadge({ priority }: { priority: string | null }) {
    const p = priority ?? "low";
    return (
        <Badge
            variant="secondary"
            className={`text-[10px] capitalize ${PRIORITY_COLORS[p] ?? "bg-zinc-100 text-zinc-600"}`}
        >
            {p}
        </Badge>
    );
}

// ---------------------------------------------------------------------------
// Ticket Detail Panel
// ---------------------------------------------------------------------------

function TicketDetailPanel({
    ticket,
    staffList,
    replyDraft,
    onReplyDraftChange,
    onActionSuccess,
}: {
    ticket: TicketDetail;
    staffList: StaffMember[];
    replyDraft: string;
    onReplyDraftChange: (val: string) => void;
    onActionSuccess: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [resolution, setResolution] = useState(ticket.resolution ?? "");
    const [assignee, setAssignee] = useState(ticket.assignedToId ?? "");
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);

    // AI rewrite state
    const [aiState, setAiState] = useState<AiState>("idle");
    const [aiImproved, setAiImproved] = useState("");
    const [aiError, setAiError] = useState<string | null>(null);

    function withFeedback(fn: () => Promise<void>) {
        setActionError(null);
        setActionSuccess(null);
        startTransition(async () => {
            try {
                await fn();
                onActionSuccess();
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "An unexpected error occurred.");
            }
        });
    }

    function handleAssign() {
        if (!assignee) return;
        withFeedback(() => assignTicket(ticket.id, assignee).then(() => {
            setActionSuccess("Ticket assigned successfully.");
        }));
    }

    function handleResolve() {
        if (!resolution.trim()) {
            setActionError("Resolution notes are required before resolving.");
            return;
        }
        withFeedback(() => resolveTicket(ticket.id, resolution).then(() => {
            setActionSuccess("Ticket resolved.");
        }));
    }

    function handleReopen() {
        withFeedback(() => reopenTicket(ticket.id).then(() => {
            setActionSuccess("Ticket reopened.");
        }));
    }

    function handleSendReply() {
        if (!replyDraft.trim()) return;
        withFeedback(() => replyToTicket(ticket.id, replyDraft).then(() => {
            onReplyDraftChange("");
            setActionSuccess("Reply sent — trader notified.");
        }));
    }

    async function handleImproveWithAI() {
        setAiState("loading");
        setAiError(null);
        try {
            const { improved } = await improveReply({
                draft: replyDraft,
                ticketSubject: ticket.subject,
                ticketCategory: ticket.category ?? "",
            });
            setAiImproved(improved);
            setAiState("preview");
        } catch (err) {
            setAiError(err instanceof Error ? err.message : "AI improvement failed.");
            setAiState("error");
        }
    }

    function handleUseImproved() {
        onReplyDraftChange(aiImproved);
        setAiState("idle");
        setAiImproved("");
    }

    function handleAiCancel() {
        setAiState("idle");
        setAiImproved("");
        setAiError(null);
    }

    const isResolved = ticket.status === "resolved" || ticket.status === "closed";
    const canModify = !isResolved;

    return (
        <Card className="border-l-4 border-l-primary/40">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-base font-semibold leading-tight truncate">
                            {ticket.subject}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <StatusBadge status={ticket.status} />
                            <PriorityBadge priority={ticket.priority} />
                            {ticket.category && (
                                <span className="text-xs text-muted-foreground capitalize">
                                    {ticket.category.replace(/_/g, " ")}
                                </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                                #{ticket.id.slice(-8)}
                            </span>
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* Trader identity */}
                <div className="rounded-md bg-muted/40 border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        <User className="h-3 w-3" /> Trader
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                            <span className="text-muted-foreground">Name: </span>
                            <span className="font-medium">{ticket.traderName ?? "—"}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">TIN: </span>
                            <span className="font-mono">{ticket.traderTin ?? "—"}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="text-muted-foreground">Email: </span>
                            <span>{ticket.traderEmail}</span>
                        </div>
                    </div>
                </div>

                {/* Original issue */}
                <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                        Original Request
                    </div>
                    <div className="rounded-md bg-muted/30 border p-3 text-sm leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {ticket.description ?? <span className="text-muted-foreground italic">No description provided.</span>}
                    </div>
                </div>

                <Separator />

                {/* Assignment */}
                {canModify && (
                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Assign to Staff
                        </div>
                        <div className="flex gap-2">
                            <Select value={assignee} onValueChange={setAssignee}>
                                <SelectTrigger className="h-8 text-xs flex-1">
                                    <SelectValue placeholder="Select staff member…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {staffList.map((s) => (
                                        <SelectItem key={s.userId} value={s.userId} className="text-xs">
                                            {s.name}
                                            {s.department ? ` — ${s.department}` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={handleAssign}
                                disabled={!assignee || isPending}
                            >
                                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Assign"}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Resolution */}
                {canModify && (
                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Resolution Notes
                        </div>
                        <Textarea
                            className="text-xs min-h-[70px] resize-y"
                            placeholder="Describe the resolution before marking as resolved…"
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                        />
                        <div className="flex gap-2 justify-end">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={handleResolve}
                                disabled={!resolution.trim() || isPending}
                            >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Resolve
                            </Button>
                        </div>
                    </div>
                )}

                {/* Reopen button for resolved tickets */}
                {isResolved && (
                    <div className="space-y-2">
                        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                            <div className="font-medium mb-1">
                                {ticket.status === "resolved" ? "Resolved" : "Closed"}{" "}
                                {ticket.resolvedAt ? `on ${new Date(ticket.resolvedAt).toLocaleDateString()}` : ""}
                            </div>
                            {ticket.resolution && (
                                <div className="whitespace-pre-wrap">{ticket.resolution}</div>
                            )}
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={handleReopen}
                            disabled={isPending}
                        >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Return to Open
                        </Button>
                    </div>
                )}

                <Separator />

                {/* Reply textarea */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Reply to Trader
                    </Label>
                    <Textarea
                        className="text-sm min-h-[100px] resize-y"
                        placeholder="Write your reply to the trader…"
                        value={replyDraft}
                        onChange={(e) => onReplyDraftChange(e.target.value)}
                    />

                    {/* AI Preview */}
                    {aiState === "preview" && (
                        <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-3">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                                <Sparkles className="h-3.5 w-3.5" />
                                AI-Improved Version
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
                                <div>
                                    <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase">Original</div>
                                    <div className="text-xs bg-white rounded border p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                        {replyDraft}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-medium text-violet-600 mb-1 uppercase">Improved</div>
                                    <Textarea
                                        className="text-xs min-h-[100px] resize-y bg-white border-violet-200"
                                        value={aiImproved}
                                        onChange={(e) => setAiImproved(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end">
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAiCancel}>
                                    <X className="h-3 w-3 mr-1" />
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
                                    onClick={handleImproveWithAI}
                                >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Try Again
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-7 text-xs bg-violet-600 hover:bg-violet-700"
                                    onClick={handleUseImproved}
                                >
                                    Use This Version
                                </Button>
                            </div>
                        </div>
                    )}

                    {aiState === "error" && aiError && (
                        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-2 text-xs text-red-700">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {aiError}
                            <button
                                className="ml-auto text-red-500 hover:text-red-700"
                                onClick={handleAiCancel}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        {/* Improve with AI */}
                        {aiState !== "preview" && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
                                onClick={handleImproveWithAI}
                                disabled={replyDraft.trim().length < 10 || aiState === "loading" || isPending}
                            >
                                {aiState === "loading" ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Improve with AI
                            </Button>
                        )}

                        <div className="ml-auto flex gap-2">
                            <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={handleSendReply}
                                disabled={!replyDraft.trim() || isPending || aiState === "loading"}
                            >
                                {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                    <Send className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Send Reply
                            </Button>
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        AI may rewrite grammar and tone — it never sends replies automatically. You control when to send.
                    </p>
                </div>

                {/* Feedback messages */}
                {actionError && (
                    <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-2 text-xs text-red-700">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {actionError}
                    </div>
                )}
                {actionSuccess && (
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-2 text-xs text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {actionSuccess}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

export default function SupportTicketPanel({
    tickets,
    staffList,
}: {
    tickets: TicketRow[];
    staffList: StaffMember[];
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [replyDraft, setReplyDraft] = useState("");
    const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

    // Race-condition guard: only apply response if it still matches the current selection
    const lastRequestedId = useRef<string | null>(null);

    const open = tickets.filter((t) => t.status === "open").length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;

    const fetchDetail = useCallback(async (ticketId: string) => {
        lastRequestedId.current = ticketId;
        setDetailLoading(true);
        setDetailError(null);
        setTicketDetail(null);
        try {
            const detail = await getTicketDetail(ticketId);
            // Only apply if still the current selection
            if (lastRequestedId.current === ticketId) {
                setTicketDetail(detail as TicketDetail);
            }
        } catch (err) {
            if (lastRequestedId.current === ticketId) {
                setDetailError(err instanceof Error ? err.message : "Failed to load ticket details.");
            }
        } finally {
            if (lastRequestedId.current === ticketId) {
                setDetailLoading(false);
            }
        }
    }, []);

    function switchTo(ticketId: string) {
        setSelectedId(ticketId);
        setReplyDraft("");
        void fetchDetail(ticketId);
    }

    function handleOpenClick(ticketId: string) {
        if (ticketId === selectedId) return; // Already open
        if (replyDraft.trim().length > 0) {
            // Warn about unsaved draft
            setPendingSwitch(ticketId);
        } else {
            switchTo(ticketId);
        }
    }

    function handleDiscardAndSwitch() {
        if (pendingSwitch) {
            switchTo(pendingSwitch);
        }
        setPendingSwitch(null);
    }

    function handleCancelSwitch() {
        setPendingSwitch(null);
    }

    // Refresh detail after an action (e.g., after resolve/assign)
    function handleActionSuccess() {
        if (selectedId) void fetchDetail(selectedId);
    }

    return (
        <div className="space-y-6">
            {/* Stats row */}
            <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                    {open} open
                </Badge>
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    {inProgress} in progress
                </Badge>
                <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">
                    {tickets.length} total
                </Badge>
            </div>

            {/* Ticket list */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-violet-500" />
                        All Tickets
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Trader</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Submitted</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tickets.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                                        No support tickets yet.
                                    </TableCell>
                                </TableRow>
                            )}
                            {tickets.map((ticket) => {
                                const isSelected = ticket.id === selectedId;
                                return (
                                    <TableRow
                                        key={ticket.id}
                                        className={
                                            isSelected
                                                ? "bg-primary/5 border-l-2 border-l-primary"
                                                : "hover:bg-muted/40 cursor-pointer"
                                        }
                                        onClick={() => handleOpenClick(ticket.id)}
                                    >
                                        <TableCell className="font-medium text-xs">{ticket.traderName ?? "—"}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground capitalize">
                                            {ticket.category?.replace(/_/g, " ")}
                                        </TableCell>
                                        <TableCell className="text-xs max-w-[180px] truncate">{ticket.subject}</TableCell>
                                        <TableCell>
                                            <PriorityBadge priority={ticket.priority} />
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={ticket.status} />
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : "—"}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant={isSelected ? "default" : "ghost"}
                                                className="h-7 text-xs gap-1"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenClick(ticket.id);
                                                }}
                                            >
                                                {isSelected ? (
                                                    <>
                                                        <Clock className="h-3 w-3" /> Open
                                                    </>
                                                ) : (
                                                    <>
                                                        Open <ChevronRight className="h-3 w-3" />
                                                    </>
                                                )}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Detail panel */}
            {selectedId && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Ticket Details
                        </h2>
                        {detailLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>

                    {detailError && (
                        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2 text-sm text-red-700">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {detailError}
                            <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-7 text-xs"
                                onClick={() => void fetchDetail(selectedId)}
                            >
                                Retry
                            </Button>
                        </div>
                    )}

                    {!detailLoading && !detailError && ticketDetail && (
                        // key forces full remount when switching tickets, clearing all local state
                        <TicketDetailPanel
                            key={selectedId}
                            ticket={ticketDetail}
                            staffList={staffList}
                            replyDraft={replyDraft}
                            onReplyDraftChange={setReplyDraft}
                            onActionSuccess={handleActionSuccess}
                        />
                    )}

                    {detailLoading && !ticketDetail && (
                        <Card>
                            <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading ticket details…
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Unsaved draft warning dialog */}
            <Dialog open={pendingSwitch !== null} onOpenChange={(open) => { if (!open) setPendingSwitch(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unsaved Reply Draft</DialogTitle>
                        <DialogDescription>
                            You have an unsaved reply draft for the current ticket. Switching to another ticket will
                            discard this draft. Do you want to continue?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleCancelSwitch}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleDiscardAndSwitch}
                        >
                            Discard &amp; Switch
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
