'use client';

import { useState, useTransition } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { deleteTaxpayerByTin, type DeleteTaxpayerResult } from '@/lib/actions/admin-delete-taxpayer.action';

export function DeleteTaxpayerDialog() {
  const [open, setOpen] = useState(false);
  const [tinNumber, setTinNumber] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [result, setResult] = useState<DeleteTaxpayerResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTinNumber('');
    setReason('');
    setStep('input');
    setResult(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleProceedToConfirm() {
    if (!/^[0-9]{9}$/.test(tinNumber.trim())) return;
    if (reason.trim().length < 10) return;
    setStep('confirm');
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteTaxpayerByTin({
        tinNumber: tinNumber.trim(),
        reason: reason.trim(),
      });
      setResult(res);
    });
  }

  const isInputValid = /^[0-9]{9}$/.test(tinNumber.trim()) && reason.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" />
          Delete TIN
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {/* ── Result Screen ── */}
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {result.success ? (
                  <>
                    <Trash2 className="h-5 w-5 text-red-500" />
                    Taxpayer Deleted
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Deletion Failed
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {result.success ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    TIN <span className="font-mono font-semibold">{result.tinNumber}</span>
                    {result.businessName && (
                      <> ({result.businessName})</>
                    )} has been deactivated and suspended.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This action has been recorded in the audit trail.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-red-600">{result.error}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : step === 'confirm' ? (
          /* ── Confirm Step ── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Confirm TIN Deletion
              </DialogTitle>
              <DialogDescription>
                This action will deactivate the taxpayer and suspend their account.
                It is audit-logged and cannot be undone from this dialog.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TIN Number</span>
                  <span className="font-mono font-semibold">{tinNumber.trim()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Reason:</span>
                  <p className="mt-0.5 text-sm">{reason.trim()}</p>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep('input')} disabled={isPending}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                {isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Deleting…</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-1.5" /> Delete TIN</>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Input Step ── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-500" />
                Delete Taxpayer (TIN)
              </DialogTitle>
              <DialogDescription>
                Deactivate a taxpayer account by their TIN number.
                A reason is required and will be recorded in the audit trail.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="tin-input">TIN Number</Label>
                <Input
                  id="tin-input"
                  placeholder="123456789"
                  maxLength={9}
                  value={tinNumber}
                  onChange={(e) => setTinNumber(e.target.value.replace(/\D/g, ''))}
                  className="font-mono"
                />
                {tinNumber.length > 0 && !/^[0-9]{9}$/.test(tinNumber) && (
                  <p className="text-xs text-red-500">TIN must be exactly 9 digits</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason-input">Reason for Deletion</Label>
                <Textarea
                  id="reason-input"
                  placeholder="Explain why this TIN is being deleted (min 10 characters)…"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="resize-none"
                />
                {reason.length > 0 && reason.trim().length < 10 && (
                  <p className="text-xs text-red-500">Reason must be at least 10 characters</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleProceedToConfirm}
                disabled={!isInputValid}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
