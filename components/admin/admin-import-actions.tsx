"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    confirmImportArrival,
    rejectImportArrival,
} from "@/lib/actions/import.action";
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
    traderReportedQuantity: number | null;
    inspectedQuantity: number | null;
    invoiceRef: string;
    supportingDoc: string;
    materialCode?: string | null;
    canInspectAndConfirm: boolean;
    canReject: boolean;
}

export function AdminImportActions({
    declarationId,
    productName,
    expectedQuantity,
    traderReportedQuantity,
    inspectedQuantity: savedInspectedQuantity,
    invoiceRef,
    supportingDoc,
    materialCode,
    canInspectAndConfirm,
    canReject,
}: AdminImportActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showReject, setShowReject] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [inspectionNote, setInspectionNote] = useState("");
    const [inspectedQuantity, setInspectedQuantity] = useState("");
    const [error, setError] = useState("");

    const parsedInspectedQuantity = Number(inspectedQuantity);
    const hasEnteredQuantity = inspectedQuantity.trim() !== '' && Number.isFinite(parsedInspectedQuantity) && parsedInspectedQuantity > 0;
    const discrepancy = hasEnteredQuantity ? expectedQuantity - parsedInspectedQuantity : 0;
    const discrepancyPct = expectedQuantity > 0 ? Math.abs(discrepancy / expectedQuantity) * 100 : 0;
    const hasDiscrepancy = hasEnteredQuantity && discrepancy !== 0;
    const traderDiscrepancyPct = traderReportedQuantity == null || expectedQuantity <= 0
        ? 0
        : Math.abs(expectedQuantity - traderReportedQuantity) / expectedQuantity * 100;
    const hasTraderDiscrepancy = traderReportedQuantity != null && traderReportedQuantity !== expectedQuantity;

    function handleConfirm() {
        startTransition(async () => {
            try {
                setError("");
                const result = await confirmImportArrival(declarationId, {
                    inspectedQuantity: parsedInspectedQuantity,
                    reviewerNote: inspectionNote.trim() || undefined,
                });
                if (!result.success) {
                    setError(result.error);
                    return;
                }
                setShowConfirm(false);
                setInspectedQuantity("");
                setInspectionNote("");
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
                    {materialCode && <div className="text-xs font-mono text-muted-foreground">Protected material code: {materialCode}</div>}
                    <div className="space-y-0.5 text-xs font-mono">
                        <p>Declared: {expectedQuantity.toLocaleString()}</p>
                        <p>Trader reported: {traderReportedQuantity?.toLocaleString() ?? 'Not provided'}</p>
                        <p>Customs verified: {savedInspectedQuantity?.toLocaleString() ?? 'Not yet inspected'}</p>
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
                    {canInspectAndConfirm && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-emerald-600"
                            onClick={() => { setError(""); setShowConfirm(true); }}
                            disabled={isPending}
                        >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Enter inspection & confirm
                        </Button>
                    )}
                    {canReject && <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-red-600"
                        onClick={() => setShowReject(true)}
                        disabled={isPending}
                    >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                    </Button>}
                </div>
            </div>

            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record Customs inspection</DialogTitle>
                        <DialogDescription>
                            Enter the quantity physically verified at the Rwanda entry point. The trader-reported quantity is informational; it will not be used as the official quantity.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-md bg-muted/50 p-3 text-sm">
                            <p><span className="text-muted-foreground">Product or material:</span> {productName}</p>
                            <p><span className="text-muted-foreground">Declared quantity:</span> {expectedQuantity.toLocaleString()}</p>
                            <p><span className="text-muted-foreground">Trader reported received:</span> {traderReportedQuantity?.toLocaleString() ?? 'Not provided'}</p>
                            {savedInspectedQuantity != null && <p><span className="text-muted-foreground">Previously verified:</span> {savedInspectedQuantity.toLocaleString()}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="customs-inspected-quantity">Quantity physically verified</Label>
                            <Input
                                id="customs-inspected-quantity"
                                type="number"
                                min="0.000001"
                                max="1000000000"
                                step="any"
                                required
                                value={inspectedQuantity}
                                onChange={(event) => setInspectedQuantity(event.target.value)}
                                placeholder="Enter inspected quantity"
                            />
                        </div>
                        {hasDiscrepancy && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                Quantity difference: {Math.abs(discrepancy).toLocaleString()} ({discrepancyPct.toFixed(1)}% of the declared quantity). Review the evidence before confirming.
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="customs-inspection-note">Inspection note <span className="text-muted-foreground">(optional)</span></Label>
                            <Textarea
                                id="customs-inspection-note"
                                value={inspectionNote}
                                onChange={(event) => setInspectionNote(event.target.value)}
                                maxLength={2000}
                                placeholder="Record relevant inspection observations"
                                rows={3}
                            />
                        </div>
                        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={isPending}>Cancel</Button>
                        <Button onClick={handleConfirm} disabled={isPending || !hasEnteredQuantity} className="gap-2">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Approve verified goods
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showReject} onOpenChange={setShowReject}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Import Declaration</DialogTitle>
                        <DialogDescription>
                            <strong>{productName}</strong> — trader reported {traderReportedQuantity?.toLocaleString() ?? 'no quantity'}
                            (expected {expectedQuantity.toLocaleString()})
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {hasTraderDiscrepancy && (
                            <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Trader-reported quantity differs from the declaration by {traderDiscrepancyPct.toFixed(1)}%.
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
