'use client';

import { useTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import { acknowledgeIndustrialAlert } from '@/lib/actions/industrial-factory.action';

export function IndustrialAlertActions({ alertId }: { alertId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function handleAcknowledge() {
    setMessage(null);
    startTransition(async () => {
      const result = await acknowledgeIndustrialAlert(alertId);
      if (result.success) {
        setMessage({ type: 'success', text: 'Alert acknowledged' });
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Failed to acknowledge alert' });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {message && (
        <p className={`text-xs ${message.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleAcknowledge}
        disabled={pending || message?.type === 'success'}
        className="text-xs h-7"
      >
        {pending ? 'Acknowledging…' : message?.type === 'success' ? 'Acknowledged ✓' : 'Acknowledge'}
      </Button>
    </div>
  );
}
