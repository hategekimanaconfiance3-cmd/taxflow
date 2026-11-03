'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Mail, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { retrySalesInvoiceEmail } from '@/lib/actions/sales-invoice.action';

interface SalesInvoiceActionsProps {
  invoiceId: string;
  canRetryEmail: boolean;
  emailStatus: string;
}

export function SalesInvoiceActions({ invoiceId, canRetryEmail, emailStatus }: SalesInvoiceActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  const emailStatusLabel = emailStatus === 'sent'
    ? 'Email accepted by provider; delivery is not confirmed.'
    : emailStatus === 'failed'
      ? 'Email delivery failed. You can retry.'
      : emailStatus === 'not_available'
        ? 'Email unavailable: no verified buyer account address is available.'
        : emailStatus === 'sending'
          ? 'Email is being submitted.'
          : 'Email is pending.';

  function retryEmail() {
    startTransition(async () => {
      try {
        const result = await retrySalesInvoiceEmail(invoiceId);
        setMessage(result.status === 'sent' ? 'Email accepted by the provider.' : `Email status: ${result.status.replaceAll('_', ' ')}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Email could not be sent.');
      }
    });
  }

  return <div className="print:hidden flex flex-wrap items-center gap-2">
    <Button asChild variant="outline" size="sm">
      <a href={`/api/sales-invoices/${invoiceId}/pdf`}><Download className="mr-2 h-4 w-4" />Download PDF</a>
    </Button>
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />Print
    </Button>
    {canRetryEmail && emailStatus !== 'sent' && emailStatus !== 'not_available' && (
      <Button variant="outline" size="sm" onClick={retryEmail} disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
        {emailStatus === 'failed' ? 'Retry email' : 'Send to buyer'}
      </Button>
    )}
    <span className="w-full text-xs text-muted-foreground" role="status" aria-live="polite">
      {emailStatusLabel}
    </span>
    {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
  </div>;
}
