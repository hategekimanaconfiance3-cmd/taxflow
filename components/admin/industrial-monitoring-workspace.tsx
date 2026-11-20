interface Summary {
  totalFactories: number;
  activeProductionLines: number;
  registeredEquipment: number;
  connectedGateways: number;
  offlineGateways: number;
  productionEventsReceived: number;
  batchesMonitored: number;
  batchesAwaitingVerification: number;
  productionDiscrepancies: number;
  factoriesAwaitingApproval: number;
}

export function IndustrialMonitoringWorkspace({ summary }: { summary: Summary }) {
  const cards = [
    ['Factories', summary.totalFactories],
    ['Active lines', summary.activeProductionLines],
    ['Registered equipment', summary.registeredEquipment],
    ['Connected gateways', summary.connectedGateways],
    ['Offline gateways', summary.offlineGateways],
    ['Events received', summary.productionEventsReceived],
    ['Batches monitored', summary.batchesMonitored],
    ['Awaiting verification', summary.batchesAwaitingVerification],
    ['Discrepancies', summary.productionDiscrepancies],
    ['Awaiting approval', summary.factoriesAwaitingApproval],
  ] as const;
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Industrial monitoring</h1><p className="mt-1 text-sm text-muted-foreground">Independent machine evidence and integration health. Telemetry is not an inventory or tax posting mechanism.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p></div>)}</div>
    <div className="rounded-lg border bg-muted/20 p-5 text-sm text-muted-foreground">Use Factory Onboarding to review lifecycle transitions. Event discrepancies remain review signals and must be investigated through authorized RRA workflows.</div>
  </div>;
}
