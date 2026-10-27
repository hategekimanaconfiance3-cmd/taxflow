"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    acknowledgeDispute,
    contestDispute,
} from "@/lib/actions/dispute.action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface DisputeResponseActionsProps {
    disputeId: string;
    referenceNumber: string;
    reason: string;
}

export function DisputeResponseActions({
    disputeId,
    referenceNumber,
    reason,
}: DisputeResponseActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showContest, setShowContest] = useState(false);
    const [contestNote, setContestNote] = useState("");
    const [error, setError] = useState("");

    function handleAcknowledge() {
        startTransition(async () => {
            try {
                setError("");
                await acknowledgeDispute(disputeId);
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to acknowledge",
                );
            }
        });
    }

    function handleContest() {
        if (!contestNote.trim()) return;

        startTransition(async () => {
            try {
                setError("");
                await contestDispute(disputeId, contestNote.trim());
                setShowContest(false);
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to contest",
                );
            }
        });
    }

    return (
        <>
            <div className="flex gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-emerald-600"
                    onClick={handleAcknowledge}
                    disabled={isPending}
                >
                    {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    Acknowledge
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-red-600"
                    onClick={() => setShowContest(true)}
                    disabled={isPending}
                >
                    <XCircle className="h-3.5 w-3.5" />
                    Contest
                </Button>
            </div>

            {error && (
                <p className="text-xs text-red-600 mt-1">{error}</p>
            )}

            <Dialog open={showContest} onOpenChange={setShowContest}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Contest Dispute</DialogTitle>
                        <DialogDescription>
                            Dispute{" "}
                            <strong className="font-mono">{referenceNumber}</strong>
                            <br />
                            <span className="text-xs mt-1 block">
                                Reason given: &ldquo;{reason}&rdquo;
                            </span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Your Response</Label>
                            <Textarea
                                placeholder="Explain why you disagree with this dispute. Provide your side of the story with any relevant details..."
                                value={contestNote}
                                onChange={(e) => setContestNote(e.target.value)}
                                rows={4}
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                This will still be escalated to RRA for review along with your response.
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowContest(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleContest}
                            disabled={isPending || !contestNote.trim()}
                            className="gap-2"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <XCircle className="h-4 w-4" />
                            )}
                            Submit Contest
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
