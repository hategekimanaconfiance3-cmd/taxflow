'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, PauseCircle, XCircle } from 'lucide-react';
import {
  approveFactory,
  suspendFactory,
  approveGateway,
  revokeGateway,
} from '@/lib/actions/industrial-factory.action';

// ---------------------------------------------------------------------------
// Factory Action Buttons
// ---------------------------------------------------------------------------

interface FactoryActionsProps {
  factoryId: string;
  currentStatus: string;
}

export function FactoryActions({ factoryId, currentStatus }: FactoryActionsProps) {
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    startTransition(async () => {
      await approveFactory(factoryId);
    });
  };

  const handleSuspend = () => {
    const reason = window.prompt('Suspension reason (required):');
    if (!reason || reason.trim().length < 5) return;
    startTransition(async () => {
      await suspendFactory({ factoryId, reason: reason.trim() });
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      {currentStatus !== 'approved' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleApprove}
          className="h-7 gap-1.5 px-2.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Approve
        </Button>
      )}
      {currentStatus !== 'suspended' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleSuspend}
          className="h-7 gap-1.5 px-2.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
        >
          <PauseCircle className="h-3.5 w-3.5" />
          Suspend
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gateway Action Buttons
// ---------------------------------------------------------------------------

interface GatewayActionsProps {
  gatewayId: string;
  currentStatus: string;
}

export function GatewayActions({ gatewayId, currentStatus }: GatewayActionsProps) {
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    startTransition(async () => {
      await approveGateway(gatewayId);
    });
  };

  const handleRevoke = () => {
    const reason = window.prompt('Revocation reason (required):');
    if (!reason || reason.trim().length < 5) return;
    startTransition(async () => {
      await revokeGateway({ gatewayId, reason: reason.trim() });
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      {currentStatus !== 'approved' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleApprove}
          className="h-7 gap-1.5 px-2.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Approve
        </Button>
      )}
      {currentStatus === 'approved' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleRevoke}
          className="h-7 gap-1.5 px-2.5 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
        >
          <XCircle className="h-3.5 w-3.5" />
          Revoke
        </Button>
      )}
    </div>
  );
}
