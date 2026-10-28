import { requireRRASession } from '@/lib/auth-guard';
import type { ReactNode } from 'react';

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  await requireRRASession('super_admin');
  return <>{children}</>;
}
