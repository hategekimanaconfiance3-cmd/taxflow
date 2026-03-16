"use server";

import { eq } from "drizzle-orm";
import { tinDb } from "@/db/tin-drizzle";
import { citizen, tinRecord } from "@/db/tin-schema";

// ---------------------------------------------------------------------------
// Auth Server Actions
// Queries the TIN database (mock government registry) for citizen/business info
// OTP send/verify is now handled by better-auth's phoneNumber plugin
// ---------------------------------------------------------------------------

export type IdLookupResult =
    | { success: true; name: string; tin: string; businessName: string; phone: string }
    | { success: false; error: string };

/**
 * Validate a National ID and return linked TIN, name, business + phone.
 * Queries the tin_db for real records.
 */
export async function validateId(nationalId: string): Promise<IdLookupResult> {
    const idRegex = /^\d{16}$/;

    if (!idRegex.test(nationalId)) {
        return { success: false, error: "ID must be exactly 16 digits." };
    }

    try {
        // Look up citizen by national ID
        const citizenResult = await tinDb
            .select()
            .from(citizen)
            .where(eq(citizen.nationalId, nationalId))
            .limit(1);

        if (citizenResult.length === 0) {
            return { success: false, error: "National ID not found in the registry." };
        }

        const foundCitizen = citizenResult[0];

        // Look up TIN record linked to national ID
        const tinResult = await tinDb
            .select()
            .from(tinRecord)
            .where(eq(tinRecord.nationalId, nationalId))
            .limit(1);

        if (tinResult.length === 0) {
            return { success: false, error: "No TIN record linked to this National ID." };
        }

        const foundTin = tinResult[0];

        return {
            success: true,
            name: `${foundCitizen.firstName} ${foundCitizen.lastName}`,
            tin: foundTin.tinNumber,
            businessName: foundTin.businessName,
            phone: foundTin.phone,
        };
    } catch (error) {
        console.error("TIN lookup failed:", error);
        return { success: false, error: "Failed to verify National ID. Please try again." };
    }
}

// ---------------------------------------------------------------------------
// RRA Staff Verification
// ---------------------------------------------------------------------------

export type RRAVerifyResult =
    | { success: true; staffId: string; clearanceLevel: string; department: string | null }
    | { success: false; error: string };

/**
 * Verify that the currently authenticated user is an active RRA staff member.
 * Called after signIn.username() in the admin login form.
 */
export async function verifyRRAStaff(): Promise<RRAVerifyResult> {
    const { auth } = await import("@/lib/auth");
    const { headers } = await import("next/headers");
    const { eq } = await import("drizzle-orm");
    const { default: db } = await import("@/db/drizzle");
    const { rraStaff } = await import("@/db/schema");

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

        return {
            success: true,
            staffId: staff.staffId,
            clearanceLevel: staff.clearanceLevel,
            department: staff.department,
        };
    } catch (error) {
        console.error("RRA staff verification failed:", error);
        return { success: false, error: "Failed to verify staff access. Please try again." };
    }
}
