"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    confirmImportArrival,
    rejectImportArrival,
} from "@/lib/actions/import.action";
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
import {
    Loader2,
    CheckCircle,
    XCircle,
    AlertTriangle,
    FileText,
} from "lucide-react";

interface AdminImportActionsProps {
    declarationId: string;
    productName: string;
    expectedQuantity: number;
    actualQuantity: number;
    invoiceRef: string;
    supportingDoc: string;
}

export function AdminImportActions({
    declarationId,
    productName,
    expectedQuantity,
    actualQuantity,
    invoiceRef,
    supportingDoc,
}: AdminImportActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showReject, setShowReject] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [error, setError] = useState("");

    const discrepancy = Math.abs(expectedQuantity - actualQuantity);
    const discrepancyPct = Math.round((discrepancy / expectedQuantity) * 100);
    const hasDiscrepancy = discrepancyPct > 10;

    function handleConfirm() {
        startTransition(async () => {
            try {
                setError("");
                const result = await confirmImportArrival(declarationId);
                if (!result.success) {
                    setError(result.error);
                    return;
                }
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to confirm",
                );
            }
        });
    }

    function handleReject() {
        if (!rejectReason.trim()) return;

        startTransition(async () => {
            try {
                setError("");
                await rejectImportArrival(declarationId, rejectReason.trim());
                setShowReject(false);
                router.refresh();
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to reject",
                );
            }
        });
    }

    return (
        <>
            <div className="flex flex-col gap-1.5">
                {/* Info summary */}
                <div className="text-left space-y-1 mb-1">
                    <div className="text-xs text-muted-foreground">
                        <strong>{productName}</strong>
                    </div>
                    <div className="text-xs font-mono">
                        Expected: {expectedQuantity.toLocaleString()} → Actual:{" "}
                        {actualQuantity.toLocaleString()}
                        {hasDiscrepancy && (
                            <span className="text-amber-600 ml-1">
                                ({discrepancyPct}% off)
                            </span>
                        )}
                    </div>
                    {invoiceRef && (
                        <div className="text-[10px] text-muted-foreground">
                            Invoice: {invoiceRef}
                        </div>
                    )}
                    {supportingDoc && (
                        supportingDoc.startsWith("/api/import-invoice/") || supportingDoc.startsWith("/uploads") ? (
                            <a
                                href={supportingDoc}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                            >
                                <FileText className="h-3 w-3 shrink-0" />
                                View Invoice PDF
                            </a>
                        ) : (
                            <div className="text-[10px] text-muted-foreground flex items-start gap-0.5">
                                <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                                <span className="truncate max-w-[120px]">
                                    {supportingDoc}
                                </span>
                            </div>
                        )
                    )}
                </div>

                {error && (
                    <div className="text-[10px] text-red-600">{error}</div>
                )}

                <div className="flex gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-emerald-600"
                        onClick={handleConfirm}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                        )}
                        Confirm
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-red-600"
                        onClick={() => setShowReject(true)}
                        disabled={isPending}
                    >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                    </Button>
                </div>
            </div>

            <Dialog open={showReject} onOpenChange={setShowReject}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Import Declaration</DialogTitle>
                        <DialogDescription>
                            <strong>{productName}</strong> — {actualQuantity.toLocaleString()} units
                            (expected {expectedQuantity.toLocaleString()})
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {hasDiscrepancy && (
                            <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Quantity discrepancy of {discrepancyPct}% detected.
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Reason for Rejection</Label>
                            <Textarea
                                placeholder="Explain why this import is being rejected (e.g., missing documents, quantity mismatch, suspicious declaration)..."
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={3}
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                                {error}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowReject(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={isPending || !rejectReason.trim()}
                            className="gap-2"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <XCircle className="h-4 w-4" />
                            )}
                            Reject Import
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
