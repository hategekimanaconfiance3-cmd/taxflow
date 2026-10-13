import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { user, account, rraStaff } from "../schema";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Taxflow Database Seed — RRA Staff Accounts (Local Development)
// ---------------------------------------------------------------------------
//
// Creates 11 RRA staff accounts:
//   1 × Super Admin
//   2 × Compliance Officer
//   2 × Audit Officer
//   2 × Stock Monitoring Officer
//   2 × Correction Officer
//   2 × Reporting & Analytics Officer
//
// Set TAXFLOW_SEED_PASSWORD to a local development password.
// Login with Staff ID at /admin-login
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === "production") {
    throw new Error("The RRA demo seed is disabled in production.");
}

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run the RRA demo seed.");
}

if (!process.env.TAXFLOW_SEED_PASSWORD || process.env.TAXFLOW_SEED_PASSWORD.length < 12) {
    throw new Error("Set TAXFLOW_SEED_PASSWORD to a value of at least 12 characters.");
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

const PASSWORD = process.env.TAXFLOW_SEED_PASSWORD;

interface StaffSeed {
    name: string;
    email: string;
    staffId: string;
    department: string;
    role: string; // clearanceLevel
}

const STAFF: StaffSeed[] = [
    // ── Super Admin ─────────────────────────────
    {
        name: "Jean-Pierre Habimana",
        email: "jphabimana@rra.gov.rw",
        staffId: "SA-001",
        department: "IT Administration",
        role: "super_admin",
    },

    // ── Compliance Officers ─────────────────────
    {
        name: "Marie-Claire Uwimana",
        email: "mcuwimana@rra.gov.rw",
        staffId: "CO-001",
        department: "Tax Compliance",
        role: "compliance_officer",
    },
    {
        name: "Patrick Niyonzima",
        email: "pniyonzima@rra.gov.rw",
        staffId: "CO-002",
        department: "Tax Compliance",
        role: "compliance_officer",
    },

    // ── Audit Officers ──────────────────────────
    {
        name: "Diane Mutoni",
        email: "dmutoni@rra.gov.rw",
        staffId: "AO-001",
        department: "Internal Audit",
        role: "audit_officer",
    },
    {
        name: "Emmanuel Nsengimana",
        email: "ensengimana@rra.gov.rw",
        staffId: "AO-002",
        department: "Internal Audit",
        role: "audit_officer",
    },

    // ── Stock Monitoring Officers ────────────────
    {
        name: "Alice Mukamana",
        email: "amukamana@rra.gov.rw",
        staffId: "SM-001",
        department: "Stock Monitoring",
        role: "stock_officer",
    },
    {
        name: "Théoneste Bizimungu",
        email: "tbizimungu@rra.gov.rw",
        staffId: "SM-002",
        department: "Stock Monitoring",
        role: "stock_officer",
    },

    // ── Correction Officers ─────────────────────
    {
        name: "Grace Ingabire",
        email: "gingabire@rra.gov.rw",
        staffId: "CR-001",
        department: "Data Integrity",
        role: "correction_officer",
    },
    {
        name: "Bosco Kamanzi",
        email: "bkamanzi@rra.gov.rw",
        staffId: "CR-002",
        department: "Data Integrity",
        role: "correction_officer",
    },

    // ── Reporting & Analytics Officers ───────────
    {
        name: "Claudine Nyirahabimana",
        email: "cnyirahabimana@rra.gov.rw",
        staffId: "RA-001",
        department: "Analytics & Reporting",
        role: "reporting_officer",
    },
    {
        name: "Fabien Mugisha",
        email: "fmugisha@rra.gov.rw",
        staffId: "RA-002",
        department: "Analytics & Reporting",
        role: "reporting_officer",
    },
];

async function seed() {
    console.log("🌱 Seeding RRA Staff accounts...\n");

    const hashedPassword = await hashPassword(PASSWORD);

    // Clear existing RRA staff data (order matters due to FK)
    await db.delete(rraStaff);
    console.log("  🗑  Cleared existing rra_staff records\n");

    for (const s of STAFF) {
        const userId = crypto.randomUUID();

        // 1. Upsert user
        await db
            .insert(user)
            .values({
                id: userId,
                name: s.name,
                username: s.staffId.toLowerCase(),
                displayUsername: s.staffId,
                email: s.email,
                emailVerified: true,
                role: "rra_staff",
                isActive: true,
            })
            .onConflictDoUpdate({
                target: user.email,
                set: {
                    name: s.name,
                    username: s.staffId.toLowerCase(),
                    displayUsername: s.staffId,
                    role: "rra_staff",
                    isActive: true,
                },
            });

        // Get the actual user ID (handles upsert case)
        const [existing] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, s.email))
            .limit(1);

        const finalUserId = existing?.id ?? userId;

        // 2. Delete existing credential accounts, then create fresh one
        await db
            .delete(account)
            .where(eq(account.userId, finalUserId));

        await db.insert(account).values({
            id: crypto.randomUUID(),
            accountId: finalUserId,
            providerId: "credential",
            userId: finalUserId,
            password: hashedPassword,
        });

        // 3. Create RRA staff record
        await db
            .insert(rraStaff)
            .values({
                id: crypto.randomUUID(),
                userId: finalUserId,
                staffId: s.staffId,
                department: s.department,
                clearanceLevel: s.role,
                assignedBy: null,
                isActive: true,
            })
            .onConflictDoNothing();

        const roleLabel = s.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        console.log(`  ✓ ${s.staffId.padEnd(7)} │ ${roleLabel.padEnd(22)} │ ${s.name}`);
    }

    console.log("\n✅ RRA Staff seeded successfully!");
    console.log("\n  📋 Login Credentials (all accounts):");
    console.log("     Password:  [provided via TAXFLOW_SEED_PASSWORD]\n");
    console.log("  ┌─────────┬────────────────────────────┬──────────────────────────────┐");
    console.log("  │ Staff ID│ Role                       │ Name                         │");
    console.log("  ├─────────┼────────────────────────────┼──────────────────────────────┤");
    for (const s of STAFF) {
        const roleLabel = s.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        console.log(
            `  │ ${s.staffId.padEnd(7)} │ ${roleLabel.padEnd(26)} │ ${s.name.padEnd(28)} │`,
        );
    }
    console.log("  └─────────┴────────────────────────────┴──────────────────────────────┘\n");

    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
