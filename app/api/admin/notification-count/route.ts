import { NextResponse } from 'next/server';
import { getAdminUnreadNotificationCount } from '@/lib/actions/admin-notification.action';

export async function GET() {
  const count = await getAdminUnreadNotificationCount();
  return NextResponse.json({ count });
}
