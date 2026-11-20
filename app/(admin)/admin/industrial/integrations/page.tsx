import { IndustrialIntegrationRequestWorkspace } from '@/components/admin/industrial-integration-request-workspace';
import { getIndustrialIntegrationRequestsForOfficer, getIndustrialIntegrationsForOfficer } from '@/lib/actions/industrial.action';

export default async function IndustrialIntegrationApprovalsPage() {
  const [requests, integrations] = await Promise.all([getIndustrialIntegrationRequestsForOfficer(), getIndustrialIntegrationsForOfficer()]);
  return <IndustrialIntegrationRequestWorkspace initialRows={requests} initialIntegrations={integrations} />;
}
