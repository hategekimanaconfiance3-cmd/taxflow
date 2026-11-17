import { IndustrialIntegrationRequestWorkspace } from '@/components/admin/industrial-integration-request-workspace';
import { getIndustrialIntegrationRequestsForOfficer } from '@/lib/actions/industrial.action';

export default async function IndustrialIntegrationApprovalsPage() {
  const requests = await getIndustrialIntegrationRequestsForOfficer();
  return <IndustrialIntegrationRequestWorkspace initialRows={requests} />;
}
