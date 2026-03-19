import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import db from '@/db/drizzle';
import { eq } from 'drizzle-orm';
import { rraStaff } from '@/db/schema';

export default async function RootPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/sign-in');
  }

  // Check if user is RRA staff
  const staffRecords = await db.select().from(rraStaff).where(eq(rraStaff.userId, session.user.id)).limit(1);

  const isRRAStaff = staffRecords.length > 0 && staffRecords[0].isActive;

  // Redirect to appropriate dashboard
  if (isRRAStaff) {
    redirect('/admin/dashboard');
  }

  redirect('/dashboard');
}
