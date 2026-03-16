"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    startComplianceAudit,
    addAuditNote,
    flagSuspiciousActivity,
} from "@/lib/actions/admin-compliance.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Flag, MessageSquarePlus, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Start Audit Dialog
// ---------------------------------------------------------------------------

export function StartAuditDialog({ traderId, traderName }: { traderId: string; traderName: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    function handleSubmit() {
        if (!reason.trim()) return;
        setError(null);
        startTransition(async () => {
            try {
                await startComplianceAudit(traderId, reason);
                setOpen(false);
                setReason("");
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed.");
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setReason(""); setError(null); } }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Start Audit
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Start Compliance Audit</DialogTitle>
                    <DialogDescription>
                        Open a new compliance audit for {traderName}. This will be
                        tracked in the audit trail.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Label htmlFor="audit-reason">Reason</Label>
                    <Textarea id="audit-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the reason for this audit..." rows={3} />
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isPending || !reason.trim()}>
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Open Audit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Add Note Dialog
// ---------------------------------------------------------------------------

export function AddAuditNoteDialog({ traderId }: { traderId: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [status, setStatus] = useState("in_progress");
    const [error, setError] = useState<string | null>(null);

    function handleSubmit() {
        if (!note.trim()) return;
        setError(null);
        startTransition(async () => {
            try {
                await addAuditNote(traderId, note, status as "open" | "in_progress" | "closed");
                setOpen(false);
                setNote("");
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed.");
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setNote(""); setError(null); } }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Add Note
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Audit Note</DialogTitle>
                    <DialogDescription>Add a progress note or close the audit.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Label htmlFor="note-text">Note</Label>
                    <Textarea id="note-text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Enter your note..." rows={3} />
                    <Label htmlFor="note-status">Update Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="closed">Close Audit</SelectItem>
                        </SelectContent>
                    </Select>
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isPending || !note.trim()} className={status === "closed" ? "bg-red-600 hover:bg-red-700" : ""}>
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {status === "closed" ? "Close Audit" : "Add Note"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Flag Suspicious Activity Dialog
// ---------------------------------------------------------------------------

export function FlagActivityDialog({ targetId, targetType, targetName }: { targetId: string; targetType: string; targetName: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [severity, setSeverity] = useState("medium");
    const [error, setError] = useState<string | null>(null);

    function handleSubmit() {
        if (!reason.trim()) return;
        setError(null);
        startTransition(async () => {
            try {
                await flagSuspiciousActivity(targetId, targetType, reason, severity as "low" | "medium" | "high" | "critical");
                setOpen(false);
                setReason("");
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed.");
            }
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setReason(""); setError(null); } }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-amber-600 border-amber-200">
                    <Flag className="h-3.5 w-3.5" />
                    Flag
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Flag Suspicious Activity</DialogTitle>
                    <DialogDescription>Flag {targetName} for investigation.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Label htmlFor="flag-reason">Reason</Label>
                    <Textarea id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe what is suspicious..." rows={3} />
                    <Label htmlFor="flag-severity">Severity</Label>
                    <Select value={severity} onValueChange={setSeverity}>
                        <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                    </Select>
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isPending || !reason.trim()} className="bg-amber-600 hover:bg-amber-700">
                        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Flag
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
