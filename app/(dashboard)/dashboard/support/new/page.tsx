import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { requireTraderSession } from '@/lib/auth-guard';
import { Button } from '@/components/ui/button';
import { SupportTicketForm } from '@/components/dashboard/support-ticket-form/support-ticket-form';

export default async function NewSupportTicketPage() {
  await requireTraderSession();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard/support">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Support
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Support Ticket</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Describe the issue and the RRA help desk will follow up.
          </p>
        </div>
      </div>

      <SupportTicketForm />
    </div>
  );
}
