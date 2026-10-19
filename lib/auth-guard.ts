import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import db from '@/db/drizzle';
import { rraStaff } from '@/db/schema';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasRRAPermission, isRRARole, isRRARoleAllowed, RRA_ROLE_VALUES, type RRAPermission, type RRARole } from '@/lib/rra-rbac';

// ---------------------------------------------------------------------------
// RRA Roles (specialized, not hierarchical)
// ---------------------------------------------------------------------------

export const RRA_ROLES = RRA_ROLE_VALUES;
export type { RRARole };

// ---------------------------------------------------------------------------
// Trader roles
// ---------------------------------------------------------------------------

export type TraderRole = 'manufacturer' | 'wholesaler' | 'retailer';

const TRADER_ROLES: TraderRole[] = ['manufacturer', 'wholesaler', 'retailer'];

/**
 * Seller → buyer compatibility matrix.
 * Retailer sells to "consumer" (special case: no buyer_id in DB).
 */
export const ALLOWED_BUYERS: Record<string, string[]> = {
  manufacturer: ['manufacturer', 'wholesaler', 'retailer'],
  wholesaler: ['wholesaler', 'retailer'],
  retailer: ['consumer'],
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Validate the session server-side and redirect if unauthenticated.
 * Use in any server component that requires a logged-in user.
 *
 * @returns The validated session (user + session data)
 */
export async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    redirect('/sign-in');
  }

  if (session.user.isActive === false) {
    redirect('/sign-in');
  }

  return session;
}

/**
 * Validate the session AND confirm the user is active RRA staff.
 * Optionally restrict to specific RRA roles.
 * Roles must match the explicit allowlist (with narrowly defined legacy aliases).
 *
 * @param allowedRoles - Roles that can access this resource. If empty, any active staff can access.
 * @returns The session plus the staff record
 */
export async function requireRRASession(...allowedRoles: RRARole[]) {
  const session = await requireSession();

  const staffRecords = await db.select().from(rraStaff).where(eq(rraStaff.userId, session.user.id)).limit(1);

  if (staffRecords.length === 0 || !staffRecords[0].isActive) {
    redirect('/sign-in');
  }

  const staff = staffRecords[0];
  if (!isRRARole(staff.clearanceLevel)) {
    redirect('/admin/dashboard');
  }
  const userRole = staff.clearanceLevel;

  // If specific roles are required, check access
  if (allowedRoles.length > 0) {
    const hasAccess = isRRARoleAllowed(userRole, allowedRoles);

    if (!hasAccess) {
      redirect('/admin/dashboard');
    }
  }

  return { ...session, staff };
}

export async function requireRRAPermission(permission: RRAPermission) {
  const rraSession = await requireRRASession();
  if (!isRRARole(rraSession.staff.clearanceLevel) || !hasRRAPermission(rraSession.staff.clearanceLevel, permission)) {
    redirect('/admin/dashboard');
  }
  return rraSession;
}

/**
 * Validate the session AND confirm the user is a trader (not RRA staff).
 * Optionally restrict to specific trader roles.
 *
 * @param allowedRoles - Optional list of allowed trader roles
 * @returns The validated session
 */
export async function requireTraderSession(allowedRoles?: TraderRole[]) {
  const session = await requireSession();
  const role = session.user.role;

  if (!role || !TRADER_ROLES.includes(role as TraderRole)) {
    redirect('/admin/dashboard');
  }

  if (allowedRoles && !allowedRoles.includes(role as TraderRole)) {
    redirect('/dashboard');
  }

  return session;
}

/**
 * Check if the user's business clearance is APPROVED.
 * Returns the session with a `suspended` flag instead of redirecting,
 * so pages can render a "suspended" banner.
 *
 * @returns The session plus suspended status
 */
export async function requireApprovedClearance() {
  const session = await requireSession();
  const clearance = (session.user as Record<string, unknown>).clearanceStatus as string;

  return {
    ...session,
    suspended: clearance !== 'approved',
    clearanceStatus: clearance ?? 'approved',
  };
}

/**
 * Validate that a seller role can sell to a buyer role.
 * Throws an error if the combination is not allowed.
 *
 * @param sellerRole - The seller's role
 * @param buyerRole - The buyer's role (or "consumer" for retail sales)
 */
export function validateRoleCompatibility(sellerRole: string, buyerRole: string): void {
  const allowed = ALLOWED_BUYERS[sellerRole];

  if (!allowed || !allowed.includes(buyerRole)) {
    throw new Error(`A ${sellerRole} cannot sell to a ${buyerRole}.`);
  }
}
