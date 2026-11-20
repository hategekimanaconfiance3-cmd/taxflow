"use server";

import { eq } from "drizzle-orm";
import { tinDb } from "@/db/tin-drizzle";
import { citizen, tinRecord } from "@/db/tin-schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { consumeRateLimit, getRequestIdentity } from "@/lib/rate-limit";
import { requireRRAPermission } from "@/lib/auth-guard";
import { z } from "zod";
// ---------------------------------------------------------------------------
// Auth Server Actions
// Queries the TIN database (mock government registry) for citizen/business info
// OTP send/verify is now handled by better-auth's phoneNumber plugin
// ---------------------------------------------------------------------------

// Error codes so the UI can branch on failure reason
export type IdLookupErrorCode =
    | "invalid_format"
    | "rate_limited"
    | "not_found"      // NID not in citizen registry
    | "no_tin"         // Citizen found but no TIN registered
    | "service_unavailable"; // DB / network error

export type IdLookupResult =
    | {
          success: true;
          // Core identity (from citizen table)
          firstName: string;
          lastName: string;
          name: string;
          dateOfBirth: string | null;
          gender: string | null;
          province: string | null;
          district: string | null;
          // Business / TIN (from tinRecord table — null when no_tin)
          tin: string | null;
          businessName: string | null;
          businessType: string | null;
          phone: string;
          email: string | null;
          address: string | null;
          tinDistrict: string | null;
          hasTin: boolean;
      }
    | { success: false; error: string; code: IdLookupErrorCode };

/**
 * Validate a National ID and return all available verified identity fields.
 * Queries the tin_db (government registry mirror) — read-only.
 * Returns typed error codes so the UI can present the right fallback.
 */
export async function validateId(nationalId: string): Promise<IdLookupResult> {
    // National IDs can resolve to protected government registry data. This lookup
    // is restricted to staff with the taxpayer-intelligence permission.
    await requireRRAPermission("taxpayer.intelligence.search");
    const parsedId = z.string().regex(/^\d{16}$/).safeParse(nationalId);
    if (!parsedId.success) {
        return { success: false, error: "ID must be exactly 16 digits.", code: "invalid_format" };
    }

    try {
        const requestHeaders = await headers();
        const limit = await consumeRateLimit(
            "national-id-lookup",
            getRequestIdentity(requestHeaders),
            5,
            60,
        );
        if (!limit.allowed) {
            return {
                success: false,
                error: "Too many verification attempts. Please try again in a minute.",
                code: "rate_limited",
            };
        }

        // Look up citizen by national ID
        let citizenResult: (typeof citizen.$inferSelect)[];
        try {
            citizenResult = await tinDb
                .select()
                .from(citizen)
                .where(eq(citizen.nationalId, nationalId))
                .limit(1);
        } catch {
            return {
                success: false,
                error: "The identity verification service is temporarily unavailable.",
                code: "service_unavailable",
            };
        }

        if (citizenResult.length === 0) {
            return {
                success: false,
                error: "National ID not found in the registry. Verify the number and try again.",
                code: "not_found",
            };
        }

        const foundCitizen = citizenResult[0];

        // Look up TIN record linked to national ID (may not exist)
        const tinResult = await tinDb
            .select()
            .from(tinRecord)
            .where(eq(tinRecord.nationalId, nationalId))
            .limit(1);

        const foundTin = tinResult.length > 0 ? tinResult[0] : null;

        if (!foundTin) {
            // Citizen exists but no TIN — identity verified, but no business record
            return {
                success: true,
                firstName: foundCitizen.firstName,
                lastName: foundCitizen.lastName,
                name: `${foundCitizen.firstName} ${foundCitizen.lastName}`,
                dateOfBirth: foundCitizen.dateOfBirth ?? null,
                gender: foundCitizen.gender ?? null,
                province: foundCitizen.province ?? null,
                district: foundCitizen.district ?? null,
                tin: null,
                businessName: null,
                businessType: null,
                phone: "",
                email: null,
                address: null,
                tinDistrict: null,
                hasTin: false,
            };
        }

        return {
            success: true,
            firstName: foundCitizen.firstName,
            lastName: foundCitizen.lastName,
            name: `${foundCitizen.firstName} ${foundCitizen.lastName}`,
            dateOfBirth: foundCitizen.dateOfBirth ?? null,
            gender: foundCitizen.gender ?? null,
            province: foundCitizen.province ?? null,
            district: foundCitizen.district ?? null,
            tin: foundTin.tinNumber,
            businessName: foundTin.businessName,
            businessType: foundTin.businessType ?? null,
            phone: foundTin.phone,
            email: foundTin.email ?? null,
            address: foundTin.address ?? null,
            tinDistrict: foundTin.district ?? null,
            hasTin: true,
        };
    } catch (error) {
        console.error("TIN lookup failed:", error);
        return {
            success: false,
            error: "The identity verification service is temporarily unavailable.",
            code: "service_unavailable",
        };
    }
}

// ---------------------------------------------------------------------------
// RRA Staff Verification
// ---------------------------------------------------------------------------

export type RRAVerifyResult =
    | { success: true; staffId: string; clearanceLevel: string; clearanceRoles: string[]; department: string | null }
    | { success: false; error: string };

/**
 * Verify that the currently authenticated user is an active TF staff member.
 * Called after signIn.username() in the admin login form.
 */
export async function verifyRRAStaff(): Promise<RRAVerifyResult> {
    const { auth } = await import("@/lib/auth");
    const { headers } = await import("next/headers");
    const { eq } = await import("drizzle-orm");
    const { default: db } = await import("@/db/drizzle");
    const { rraStaff, rraStaffRole } = await import("@/db/schema");

    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return { success: false, error: "Not authenticated." };
        }

        const staffRecords = await db
            .select()
            .from(rraStaff)
            .where(eq(rraStaff.userId, session.user.id))
            .limit(1);

        if (staffRecords.length === 0) {
            return { success: false, error: "This account is not authorized for staff access." };
        }

        const staff = staffRecords[0];

        if (!staff.isActive) {
            return { success: false, error: "This staff account has been deactivated." };
        }

        const roleAssignments = await db.select({ role: rraStaffRole.role }).from(rraStaffRole)
            .where(eq(rraStaffRole.staffRecordId, staff.id));
        const clearanceRoles = roleAssignments.length ? roleAssignments.map((assignment) => assignment.role) : [staff.clearanceLevel];

        return {
            success: true,
            staffId: staff.staffId,
            clearanceLevel: staff.clearanceLevel,
            clearanceRoles,
            department: staff.department,
        };
    } catch (error) {
        console.error("TF staff verification failed:", error);
        return { success: false, error: "Failed to verify staff access. Please try again." };
    }
}

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------

/**
 * Sign out the current user server-side and redirect.
 * Uses better-auth server API to revoke the session + Next.js redirect().
 */
export async function signOutAction(redirectTo: string = "/sign-in"): Promise<void> {
    try {
        await auth.api.signOut({
            headers: await headers(),
        });
    } catch (error) {
        console.error("Sign-out failed:", error);
    }

    redirect(redirectTo);
}
