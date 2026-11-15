import { redirect } from 'next/navigation';

/** Keep legacy dashboard links working while authorization stays on the canonical page. */
export default function LegacyAdminAnomaliesPage() {
  redirect('/admin/anomalies');
}
