import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface PriorityAlert {
  id: string;
  severity: AlertSeverity;
  message: string;
  href?: string;
}

interface PriorityAlertsProps {
  alerts: PriorityAlert[];
}

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  critical: 'border-red-200 bg-red-50/60 text-red-800 hover:bg-red-50/90',
  warning: 'border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-50/90',
  info: 'border-blue-200 bg-blue-50/60 text-blue-800 hover:bg-blue-50/90',
};

const SEVERITY_ICON_COLORS: Record<AlertSeverity, string> = {
  critical: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

const SEVERITY_ICONS = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

const LABEL_STYLES: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
};

export function PriorityAlerts({ alerts }: PriorityAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-0.5">
        Priority Alerts
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.map((alert) => {
          const Icon = SEVERITY_ICONS[alert.severity];
          const inner = (
            <div
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 transition-colors',
                SEVERITY_STYLES[alert.severity],
                alert.href && 'cursor-pointer',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5 shrink-0', SEVERITY_ICON_COLORS[alert.severity])} />
              <p className="text-xs font-medium flex-1 leading-tight">{alert.message}</p>
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                  LABEL_STYLES[alert.severity],
                )}
              >
                {SEVERITY_LABELS[alert.severity]}
              </span>
            </div>
          );

          return alert.href ? (
            <Link key={alert.id} href={alert.href}>
              {inner}
            </Link>
          ) : (
            <div key={alert.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
