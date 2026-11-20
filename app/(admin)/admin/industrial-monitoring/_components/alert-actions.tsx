'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { acknowledgeIndustrialAlert } from '@/lib/actions/industrial-factory.action';
import { toast } from 'sonner';

export function IndustrialAlertActions({ alertId }: { alertId: string }) {
  const [pending, startTransition] = useTransition();

  function handleAcknowledge() {
    startTransition(async () => {
      const result = await acknowledgeIndustrialAlert(alertId);
      if (result.success) {
        toast.success('Alert acknowledged');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleAcknowledge}
      disabled={pending}
      className="text-xs h-7"
    >
      {pending ? 'Acknowledging…' : 'Acknowledge'}
    </Button>
  );
}
