import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import db from '@/db/drizzle';
import { auditLog, rraStaff, rraStaffRole } from '@/db/schema';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasOperationalRRAPermission, hasRRAPermission, isRRARole, isRRARoleAllowed, RRA_ROLE_VALUES, type RRAPermission, type RRARole } from '@/lib/rra-rbac';

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
// Audit helper
// ---------------------------------------------------------------------------

/**
 * Log a permission denial to the audit_log table.
 * Awaits the log write before redirecting. A logging outage is logged server-side
 * without exposing database details to the employee.
 */
async function logAccessDenial(userId: string, detail: {
  action: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId,
      action: detail.action,
      targetType: detail.targetType ?? null,
      targetId: null,
      metadata: detail.metadata ? JSON.stringify(detail.metadata) : null,
    });
  } catch (error) {
    console.error('Failed to write RRA access-denial audit event', {
      userId,
      action: detail.action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

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
 * Permission denials are written to the audit_log before redirecting so that
 * probing attempts leave a forensic trail.
 *
 * @param allowedRoles - Roles that can access this resource. If empty, any active staff can access.
 * @returns The session plus the staff record and all effective role assignments
 */
export async function requireRRASession(...allowedRoles: RRARole[]) {
  const session = await requireSession();

  const staffRecords = await db.select().from(rraStaff).where(eq(rraStaff.userId, session.user.id)).limit(1);

  if (staffRecords.length === 0 || !staffRecords[0].isActive) {
    // Could be a trader hitting an admin route — not a security concern to log.
    redirect('/sign-in');
  }

  const staff = staffRecords[0];
  const assignedRows = await db.select({ role: rraStaffRole.role })
    .from(rraStaffRole)
    .where(eq(rraStaffRole.staffRecordId, staff.id));
  const assignedRoles = assignedRows.length ? assignedRows.map((row) => row.role) : [staff.clearanceLevel];
  const clearanceRoles = [...new Set(assignedRoles.filter(isRRARole))];
  if (clearanceRoles.length === 0) {
    // Unrecognized clearance level — log and redirect.
    await logAccessDenial(session.user.id, {
      action: 'ACCESS_DENIED_UNKNOWN_ROLE',
      targetType: 'rra_staff',
      metadata: { clearanceLevel: staff.clearanceLevel, assignedRoles },
    });
    redirect('/admin/dashboard');
  }

  // If specific roles are required, check access
  if (allowedRoles.length > 0) {
    const hasAccess = clearanceRoles.some((role) => isRRARoleAllowed(role, allowedRoles));

    if (!hasAccess) {
      // Log the denial — role is valid but insufficient for this resource.
      await logAccessDenial(session.user.id, {
        action: 'ACCESS_DENIED_INSUFFICIENT_ROLE',
        targetType: 'rra_guard',
        metadata: {
          clearanceRoles,
          requiredRoles: allowedRoles,
        },
      });
      redirect('/admin/dashboard');
    }
  }

  return { ...session, staff: { ...staff, clearanceRoles } };
}

/**
 * Validate that the current staff member has a specific fine-grained permission.
 * Denials are logged to the audit trail.
 *
 * @param permission - The required permission key from RRA_PERMISSIONS
 */
export async function requireRRAPermission(permission: RRAPermission) {
  const rraSession = await requireRRASession();
  if (!rraSession.staff.clearanceRoles.some((role) => hasRRAPermission(role, permission))) {
    await logAccessDenial(rraSession.user.id, {
      action: 'ACCESS_DENIED_MISSING_PERMISSION',
      targetType: 'rra_permission',
      metadata: {
        userRoles: rraSession.staff.clearanceRoles,
        requiredPermission: permission,
      },
    });
    redirect('/admin/dashboard');
  }
  return rraSession;
}

/** Require a permission granted by an operational role, excluding super_admin-only access. */
export async function requireRRAOperationalPermission(permission: RRAPermission) {
  const rraSession = await requireRRASession();
  if (!hasOperationalRRAPermission(rraSession.staff.clearanceRoles, permission)) {
    await logAccessDenial(rraSession.user.id, {
      action: 'ACCESS_DENIED_MISSING_OPERATIONAL_PERMISSION',
      targetType: 'rra_permission',
      metadata: {
        userRoles: rraSession.staff.clearanceRoles,
        requiredPermission: permission,
      },
    });
    redirect('/admin/dashboard');
  }
  return rraSession;
}

export function hasRRARole(staff: { clearanceLevel: string; clearanceRoles?: RRARole[] }, role: RRARole): boolean {
  return staff.clearanceRoles?.includes(role) ?? staff.clearanceLevel === role;
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
