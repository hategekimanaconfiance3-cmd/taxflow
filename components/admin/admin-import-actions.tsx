"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    confirmImportArrival,
    rejectImportArrival,
} from "@/lib/actions/import.action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
    const [inspectedQuantity, setInspectedQuantity] = useState(String(actualQuantity));
    const [inspectionNote, setInspectionNote] = useState("");
    const [error, setError] = useState("");

    const discrepancy = Math.abs(expectedQuantity - (Number(inspectedQuantity) || 0));
    const discrepancyPct = Math.round((discrepancy / expectedQuantity) * 100);
    const hasDiscrepancy = discrepancyPct > 10;

    function handleConfirm() {
        startTransition(async () => {
            try {
                setError("");
                await confirmImportArrival(declarationId, {
                    inspectedQuantity: Number(inspectedQuantity),
                    inspectionNote: inspectionNote.trim() || undefined,
                });
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
                        Expected: {expectedQuantity.toLocaleString()} → Merchant reported:{" "}
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
                        supportingDoc.startsWith("/uploads") ? (
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

                <div className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:max-w-md">
                    <div className="space-y-1.5">
                        <Label htmlFor={`inspected-${declarationId}`}>Quantity physically inspected by Customs</Label>
                        <Input
                            id={`inspected-${declarationId}`}
                            type="number"
                            min="0.001"
                            step="any"
                            value={inspectedQuantity}
                            onChange={(e) => setInspectedQuantity(e.target.value)}
                            disabled={isPending}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`inspection-note-${declarationId}`}>Inspection notes (optional)</Label>
                        <Textarea
                            id={`inspection-note-${declarationId}`}
                            placeholder="Record differences, documents checked, or inspection notes"
                            value={inspectionNote}
                            onChange={(e) => setInspectionNote(e.target.value)}
                            maxLength={2000}
                            rows={2}
                            disabled={isPending}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">The inspected quantity—not the trader's estimate—will be used for the official record and inventory activation.</p>
                </div>

                <div className="flex gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-emerald-600"
                        onClick={handleConfirm}
                        disabled={isPending || !inspectedQuantity || !Number.isFinite(Number(inspectedQuantity)) || Number(inspectedQuantity) <= 0}
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
