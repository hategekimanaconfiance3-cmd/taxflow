"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmImportArrival, rejectImportArrival } from "@/lib/actions/import.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react";

interface AdminImportActionsProps {
    declarationId: string;
    productName: string;
    expectedQuantity: number;
    actualQuantity: number;
    supplierName?: string;
    originCountry?: string;
    expectedReturnDate?: string;
    estimatedValue?: number | null;
    currency?: string;
    invoiceRef: string;
    supportingDoc: string;
}

export function AdminImportActions({
    declarationId, productName, expectedQuantity, actualQuantity, supplierName,
    originCountry, expectedReturnDate, estimatedValue, currency, invoiceRef, supportingDoc,
}: AdminImportActionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showReject, setShowReject] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [inspectedQuantity, setInspectedQuantity] = useState(String(actualQuantity || expectedQuantity));
    const [inspectionNote, setInspectionNote] = useState("");
    const [error, setError] = useState("");

    const inspected = Number(inspectedQuantity);
    const expectedDiscrepancyPct = expectedQuantity > 0 ? Math.abs(expectedQuantity - inspected) / expectedQuantity : 0;
    const reportedDiscrepancyPct = actualQuantity > 0 ? Math.abs(actualQuantity - inspected) / actualQuantity : 0;
    const discrepancyPct = Math.round(Math.max(expectedDiscrepancyPct, reportedDiscrepancyPct) * 100);
    const hasDiscrepancy = discrepancyPct > 10;

    function handleConfirm() {
        if (!Number.isFinite(inspected) || inspected <= 0) {
            setError("Enter the quantity physically inspected by customs.");
            return;
        }
        if (hasDiscrepancy && !inspectionNote.trim()) {
            setError("A written inspection note is required when the inspected quantity differs by more than 10% from the declaration or merchant-reported quantity.");
            return;
        }
        startTransition(async () => {
            try {
                setError("");
                await confirmImportArrival(declarationId, {
                    inspectedQuantity: inspected,
                    inspectionNote: inspectionNote.trim() || undefined,
                });
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to confirm inspection");
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
                setError(err instanceof Error ? err.message : "Failed to reject");
            }
        });
    }

    return (
        <>
            <div className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="space-y-1 text-left">
                    <div className="text-sm font-semibold">{productName}</div>
                    <div className="text-xs text-muted-foreground">Expected: {expectedQuantity.toLocaleString()} · Merchant reported: {actualQuantity.toLocaleString()}</div>
                    {originCountry && <div className="text-xs text-muted-foreground">Country: {originCountry}</div>}
                    {supplierName && <div className="text-xs text-muted-foreground">Supplier: {supplierName}</div>}
                    {expectedReturnDate && <div className="text-xs text-muted-foreground">Expected return: {expectedReturnDate}</div>}
                    {estimatedValue != null && <div className="text-xs text-muted-foreground">Estimated value: {estimatedValue.toLocaleString()} {currency || "RWF"}</div>}
                    {invoiceRef && <div className="text-xs text-muted-foreground">Invoice: {invoiceRef}</div>}
                    {supportingDoc && (
                        supportingDoc.startsWith("/uploads") ? (
                            <a href={supportingDoc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <FileText className="h-3 w-3" /> View supporting document
                            </a>
                        ) : <div className="text-xs text-muted-foreground">Supporting document: {supportingDoc}</div>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor={`inspected-${declarationId}`}>Quantity physically inspected by customs</Label>
                    <Input id={`inspected-${declarationId}`} type="number" min={1} step="any" value={inspectedQuantity} onChange={(e) => setInspectedQuantity(e.target.value)} />
                    {hasDiscrepancy && <p className="flex items-start gap-1 text-xs text-amber-600"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Quantity differs by {discrepancyPct}% from the expected or merchant-reported amount. Add an inspection note before confirming.</p>}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`inspection-note-${declarationId}`}>Inspection notes (optional)</Label>
                    <Textarea id={`inspection-note-${declarationId}`} value={inspectionNote} onChange={(e) => setInspectionNote(e.target.value)} placeholder="Record quantity differences, missing items, or document checks" rows={2} maxLength={2000} />
                </div>

                {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1" onClick={handleConfirm} disabled={isPending || !inspectedQuantity || inspected <= 0 || (hasDiscrepancy && !inspectionNote.trim())}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        Confirm inspected goods
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-red-600" onClick={() => setShowReject(true)} disabled={isPending}>
                        <XCircle className="h-3.5 w-3.5" /> Flag / Reject
                    </Button>
                </div>
            </div>

            <Dialog open={showReject} onOpenChange={setShowReject}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Flag or reject import declaration</DialogTitle>
                        <DialogDescription>{productName} — expected {expectedQuantity.toLocaleString()}, customs inspected {Number.isFinite(inspected) ? inspected.toLocaleString() : "not entered"}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label>Reason (required)</Label>
                        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain the mismatch or missing documents" rows={3} maxLength={2000} />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReject(false)} disabled={isPending}>Cancel</Button>
                        <Button variant="destructive" onClick={handleReject} disabled={isPending || !rejectReason.trim()}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Flag / Reject</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
