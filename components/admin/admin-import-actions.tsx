"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmImportArrival, rejectImportArrival } from "@/lib/actions/import.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle, FileText, Loader2, XCircle } from "lucide-react";

interface AdminImportActionsProps {
  declarationId: string;
  productName: string;
  expectedQuantity: number;
  invoiceRef: string;
  supportingDoc: string;
  materialCode?: string | null;
}

export function AdminImportActions({
  declarationId, productName, expectedQuantity, invoiceRef, supportingDoc, materialCode,
}: AdminImportActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showInspect, setShowInspect] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [inspectedQuantity, setInspectedQuantity] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState("");
  const qty = Number(inspectedQuantity);
  const discrepancyPct = qty > 0 ? Math.round((Math.abs(expectedQuantity - qty) / expectedQuantity) * 100) : 0;
  const hasInvoice = Boolean(invoiceRef && supportingDoc.startsWith("/api/import-invoice/"));

  function handleConfirm() {
    if (!Number.isFinite(qty) || qty <= 0) { setError("Enter the quantity physically verified by Customs."); return; }
    startTransition(async () => {
      try {
        setError("");
        const result = await confirmImportArrival(declarationId, { inspectedQuantity: qty, reviewerNote: reviewerNote.trim() || undefined });
        if (!result.success) { setError(result.error); return; }
        setShowInspect(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve the inspected arrival.");
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
        setError(err instanceof Error ? err.message : "Failed to reject the declaration.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="space-y-1 text-left">
          <div className="text-sm font-medium">{productName}</div>
          {materialCode && <div className="text-xs font-mono text-muted-foreground">Protected material code: {materialCode}</div>}
          <div className="text-xs text-muted-foreground">Expected quantity: <span className="font-mono text-foreground">{expectedQuantity.toLocaleString()}</span></div>
          {invoiceRef && <div className="text-xs text-muted-foreground">Invoice reference: {invoiceRef}</div>}
          {supportingDoc.startsWith("/api/import-invoice/") && (
            <a href={supportingDoc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><FileText className="h-3 w-3" />View Invoice PDF</a>
          )}
          {!hasInvoice && <p className="text-xs text-amber-700">Trader invoice documents are not attached yet. Approval requires an invoice reference and PDF.</p>}
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1 text-emerald-700" onClick={() => { setError(""); setShowInspect(true); }} disabled={isPending || !hasInvoice}>
            <CheckCircle className="h-3.5 w-3.5" />Inspect &amp; approve
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-red-600" onClick={() => { setError(""); setShowReject(true); }} disabled={isPending}>
            <XCircle className="h-3.5 w-3.5" />Reject
          </Button>
        </div>
      </div>

      <Dialog open={showInspect} onOpenChange={setShowInspect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Customs physical inspection</DialogTitle>
            <DialogDescription>
              Enter only the quantity physically counted and verified by the authorized RRA officer. This value will be recorded as the approved arrival quantity and posted to stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm"><strong>{productName}</strong><div className="text-xs text-muted-foreground mt-1">Trader expected: {expectedQuantity.toLocaleString()}</div></div>
            <div className="space-y-2">
              <Label htmlFor={`inspected-${declarationId}`}>Physically inspected quantity</Label>
              <Input id={`inspected-${declarationId}`} type="number" min="0.000001" step="any" value={inspectedQuantity} onChange={(event) => setInspectedQuantity(event.target.value)} placeholder="Enter Customs verified quantity" autoFocus />
            </div>
            {qty > 0 && discrepancyPct > 10 && <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />Inspected quantity differs from expected by {discrepancyPct}%.</div>}
            <div className="space-y-2"><Label htmlFor={`review-note-${declarationId}`}>Inspection note (optional)</Label><Textarea id={`review-note-${declarationId}`} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} rows={3} placeholder="Record inspection details or quantity discrepancy explanation" /></div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInspect(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={isPending || !Number.isFinite(qty) || qty <= 0} className="gap-2">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}Approve inspected goods</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Import Declaration</DialogTitle><DialogDescription><strong>{productName}</strong> — expected {expectedQuantity.toLocaleString()} units.</DialogDescription></DialogHeader>
          <div className="space-y-2 py-2"><Label htmlFor={`reject-reason-${declarationId}`}>Reason for rejection</Label><Textarea id={`reject-reason-${declarationId}`} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} autoFocus placeholder="Explain the inspection or documentation issue." />{error && <div className="text-sm text-red-600">{error}</div>}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)} disabled={isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={isPending || !rejectReason.trim()} className="gap-2">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Reject declaration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
