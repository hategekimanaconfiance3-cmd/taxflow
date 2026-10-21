'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTransactionPaymentStatus } from '@/lib/actions/transaction.action';

export function PaymentStatusControl({ transactionId, status }: { transactionId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  return (
    <div className="space-y-1">
      <select
        aria-label="Payment status"
        className="h-8 rounded-md border bg-background px-2 text-xs capitalize"
        value={status}
        disabled={isPending}
        onChange={(event) => {
          const nextStatus = event.target.value as 'unpaid' | 'partial' | 'paid';
          setError('');
          startTransition(async () => {
            try {
              await updateTransactionPaymentStatus(transactionId, nextStatus);
              router.refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not update payment status.');
            }
          });
        }}
      >
        <option value="unpaid">Unpaid</option>
        <option value="partial">Partially paid</option>
        <option value="paid">Paid</option>
      </select>
      {error && <p className="max-w-36 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
