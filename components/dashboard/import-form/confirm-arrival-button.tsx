"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmImportArrival } from "@/lib/actions/import.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck } from "lucide-react";

interface SubmitArrivalButtonProps {
  declarationId: string;
  productName: string;
  expectedQuantity: number;
}

/** Customs-only inspection action. The server action enforces the officer role. */
export function SubmitArrivalButton({
  declarationId,
  productName,
  expectedQuantity,
}: SubmitArrivalButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [inspectedQuantity, setInspectedQuantity] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    const quantity = Number(inspectedQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter the quantity physically verified at Customs.");
      return;
    }
    startTransition(async () => {
      setError("");
      try {
        const result = await confirmImportArrival(declarationId, {
          inspectedQuantity: quantity,
          reviewerNote: reviewerNote.trim() || undefined,
        });
        if (!result.success) throw new Error(result.error);
        setOpen(false);
        setInspectedQuantity("");
        setReviewerNote("");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Customs confirmation failed.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <ShieldCheck className="h-3.5 w-3.5" /> Confirm Customs inspection
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Verify imported goods</DialogTitle>
          <DialogDescription>
            Record the quantity physically inspected for {productName}. Only an authorized Customs officer can approve this quantity.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">Declared quantity: {expectedQuantity.toLocaleString()}</p>
          <div className="grid gap-1.5">
            <Label htmlFor="inspected-quantity">Quantity physically inspected</Label>
            <Input
              id="inspected-quantity"
              type="number"
              min="0.001"
              step="any"
              value={inspectedQuantity}
              onChange={(event) => setInspectedQuantity(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customs-reviewer-note">Inspection note</Label>
            <Textarea id="customs-reviewer-note" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} maxLength={2000} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !inspectedQuantity}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm inspected quantity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
