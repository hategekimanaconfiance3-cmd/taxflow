type StatusType = 'active' | 'maintenance' | 'degraded' | 'outage';

interface SystemStatusProps {
  status?: StatusType;
  message?: string;
}

const STATUS_CONFIG: Record<StatusType, { dot: string; ping: string; label: string }> = {
  active: { dot: 'bg-cyan-400', ping: 'bg-cyan-400', label: 'System active' },
  maintenance: { dot: 'bg-yellow-400', ping: 'bg-yellow-400', label: 'Maintenance' },
  degraded: { dot: 'bg-orange-400', ping: 'bg-orange-400', label: 'Degraded performance' },
  outage: { dot: 'bg-red-500', ping: 'bg-red-400', label: 'Service outage' },
};

export function SystemStatus({ status = 'active', message }: SystemStatusProps) {
  const config = STATUS_CONFIG[status];
  const label = message ?? config.label;

  return (
    <div className="flex items-center gap-2">
      {/* Pinging dot — sits outside the pill */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.ping} opacity-60`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`} />
      </span>

      {/* Pill — transparent bg, cyan border */}
      <span className="rounded-md border border-cyan-400 bg-transparent px-3 py-0.5 text-center">
        <span className="text-xs font-medium text-gray-800 text-center">{label}</span>
      </span>
    </div>
  );
}
