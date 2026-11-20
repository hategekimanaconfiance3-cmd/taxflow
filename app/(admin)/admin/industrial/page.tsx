import { IndustrialMonitoringWorkspace } from "@/components/admin/industrial-monitoring-workspace";
import { getIndustrialMonitoringSummaryForOfficer } from "@/lib/actions/industrial.action";

export default async function IndustrialMonitoringPage() {
  const summary = await getIndustrialMonitoringSummaryForOfficer();
  return <IndustrialMonitoringWorkspace summary={summary} />;
}
