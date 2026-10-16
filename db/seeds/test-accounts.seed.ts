/**
 * TaxFlow Rwanda — Test Accounts Seed
 * ====================================
 * Creates 10 test merchant accounts and verifies the SA-001 RRA staff account.
 *
 * SAFETY GUARDS:
 *  - Blocked in production (NODE_ENV=production throws immediately)
 *  - Requires TAXFLOW_SEED_PASSWORD env var (min 8 chars)
 *  - Idempotent: skips accounts that already exist (by TIN / staffId)
 *  - Never stores plaintext passwords — uses better-auth's hashPassword
 *  - Does NOT delete existing records, transactions, or audit history
 *
 * MERCHANTS (10):
 *  TIN login IDs: 100000001 – 100000010
 *  These are 9-digit numeric test TINs accepted by the signin form.
 *  Roles are spread across manufacturer / wholesaler / retailer.
 *
 * RRA STAFF (1):
 *  SA-001 — super_admin (already created by taxflow.seed.ts;
 *  this script upserts it safely if it doesn't exist yet)
 *
 * USAGE:
 *  TAXFLOW_SEED_PASSWORD="Conf123%" tsx db/seeds/test-accounts.seed.ts
 *
 * After running, merchants log in at /sign-in with their TIN number.
 * SA-001 logs in at /admin-login with staff ID "SA-001".
 */

import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, or } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { user, account, rraStaff } from '../schema';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Safety guards — must run before any DB connection
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  throw new Error('[test-accounts.seed] Seeding is disabled in production.');
}

if (!process.env.DATABASE_URL) {
  throw new Error('[test-accounts.seed] DATABASE_URL environment variable is required.');
}

const RAW_PASSWORD = process.env.TAXFLOW_SEED_PASSWORD;
if (!RAW_PASSWORD || RAW_PASSWORD.length < 8) {
  throw new Error(
    '[test-accounts.seed] Set TAXFLOW_SEED_PASSWORD to at least 8 characters.\n' +
    'Example: TAXFLOW_SEED_PASSWORD="Conf123%" tsx db/seeds/test-accounts.seed.ts',
  );
}

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

// ---------------------------------------------------------------------------
// Merchant definitions
//
// TINs are 9-digit numeric strings — the format accepted by the signin form
// (regex /^\d+$/, length 9–10).
//
// National IDs are 16-digit strings — format required by the user table.
// Emails must be unique; we use @taxflow.test (not a real domain).
// Phones use +25078800XXXX — not real numbers.
//
// Roles cycle: manufacturer, wholesaler, retailer so all three are covered.
// ---------------------------------------------------------------------------

const ROLES: Array<'manufacturer' | 'wholesaler' | 'retailer'> = [
  'manufacturer',
  'wholesaler',
  'retailer',
  'manufacturer',
  'wholesaler',
  'retailer',
  'manufacturer',
  'wholesaler',
  'retailer',
  'manufacturer',
];

const BUSINESS_LABELS: Record<string, string> = {
  manufacturer: 'Industries Ltd',
  wholesaler: 'Trading Co',
  retailer: 'General Store',
};

interface MerchantSeed {
  id: string;
  name: string;
  email: string;
  phone: string;
  nationalId: string;
  tinNumber: string; // 9-digit string — used as the login username
  businessName: string;
  role: 'manufacturer' | 'wholesaler' | 'retailer';
  clearanceStatus: 'approved';
}

const MERCHANTS: MerchantSeed[] = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  const padded = String(n).padStart(2, '0');
  const role = ROLES[i];
  const tin = `10000000${n}`; // 9-digit: 100000001 … 100000010

  return {
    id: crypto.randomUUID(),
    name: `Test Merchant ${padded}`,
    email: `merchant${padded}@taxflow.test`,
    phone: `+25078800${padded}00`,
    nationalId: `119900${padded}00000000`, // 16-digit synthetic ID
    tinNumber: tin,
    businessName: `Test ${role.charAt(0).toUpperCase() + role.slice(1)} ${padded} ${BUSINESS_LABELS[role]}`,
    role,
    clearanceStatus: 'approved',
  };
});

// ---------------------------------------------------------------------------
// RRA Super-Admin definition (SA-001)
// Idempotent — skipped if already present
// ---------------------------------------------------------------------------

const RRA_ADMIN = {
  id: crypto.randomUUID(),
  name: 'Jean-Pierre Habimana',
  email: 'hategekimanaconfiance3@gmail.com',
  staffId: 'SA-001',
  department: 'IT Administration',
  clearanceLevel: 'super_admin' as const,
};

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log('\n🌱  TaxFlow — Test Accounts Seed');
  console.log('='.repeat(50));

  const hashed = await hashPassword(RAW_PASSWORD!);

  // ── Merchants ─────────────────────────────────────────────────────────────

  console.log('\n📦  Creating 10 test merchant accounts…\n');
  let merchantsCreated = 0;
  let merchantsSkipped = 0;

  for (const m of MERCHANTS) {
    // Check by TIN (unique) — skip if already exists
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.tinNumber, m.tinNumber))
      .limit(1);

    if (existing) {
      console.log(`  ⏭   TIN ${m.tinNumber} already exists — skipped`);
      merchantsSkipped++;
      continue;
    }

    // Insert user row
    await db.insert(user).values({
      id: m.id,
      name: m.name,
      email: m.email,
      emailVerified: false,
      phoneNumber: m.phone,
      phoneNumberVerified: false,
      nationalId: m.nationalId,
      tinNumber: m.tinNumber,
      username: m.tinNumber,        // username = TIN — this is the login identifier
      displayUsername: m.tinNumber,
      businessName: m.businessName,
      role: m.role,
      clearanceStatus: m.clearanceStatus,
      isActive: true,
    });

    // Insert account row (credential store — better-auth pattern)
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: m.id,
      providerId: 'credential',
      userId: m.id,
      password: hashed,
    });

    console.log(`  ✅  TIN ${m.tinNumber}  |  ${m.role.padEnd(12)}  |  ${m.name}`);
    merchantsCreated++;
  }

  // ── RRA Staff SA-001 ──────────────────────────────────────────────────────

  console.log('\n🛡️   Ensuring RRA staff account SA-001…\n');

  const [existingStaff] = await db
    .select({ id: rraStaff.id, userId: rraStaff.userId })
    .from(rraStaff)
    .where(eq(rraStaff.staffId, RRA_ADMIN.staffId))
    .limit(1);

  if (existingStaff) {
    console.log(`  ⏭   SA-001 already exists — skipped`);
  } else {
    // Check if user account exists (email-based match)
    let adminUserId: string;

    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(
        or(
          eq(user.email, RRA_ADMIN.email),
          eq(user.username, RRA_ADMIN.staffId),
        ),
      )
      .limit(1);

    if (existingUser) {
      adminUserId = existingUser.id;
      console.log(`  ℹ️   User for SA-001 already exists — reusing (id: ${adminUserId})`);
    } else {
      adminUserId = RRA_ADMIN.id;

      await db.insert(user).values({
        id: adminUserId,
        name: RRA_ADMIN.name,
        email: RRA_ADMIN.email,
        emailVerified: true,
        username: RRA_ADMIN.staffId,   // username = staffId — used by admin login
        displayUsername: RRA_ADMIN.staffId,
        role: 'rra_staff',
        clearanceStatus: 'approved',
        isActive: true,
      });

      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: adminUserId,
        providerId: 'credential',
        userId: adminUserId,
        password: hashed,
      });

      console.log(`  ✅  User created for SA-001 (${RRA_ADMIN.name})`);
    }

    // Create rra_staff record
    await db.insert(rraStaff).values({
      id: crypto.randomUUID(),
      userId: adminUserId,
      staffId: RRA_ADMIN.staffId,
      department: RRA_ADMIN.department,
      clearanceLevel: RRA_ADMIN.clearanceLevel,
      isActive: true,
    });

    console.log(`  ✅  SA-001  |  super_admin  |  ${RRA_ADMIN.name}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(50));
  console.log('✅  Seed complete\n');
  console.log(`  Merchants created : ${merchantsCreated}`);
  console.log(`  Merchants skipped : ${merchantsSkipped} (already existed)`);
  console.log('\n  Login credentials:');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  MERCHANTS — login at /sign-in              │');
  console.log('  │  TIN: 100000001 … 100000010                 │');
  console.log('  │  Password: (value of TAXFLOW_SEED_PASSWORD) │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │  RRA STAFF — login at /admin-login          │');
  console.log('  │  Staff ID: SA-001                           │');
  console.log('  │  Password: (value of TAXFLOW_SEED_PASSWORD) │');
  console.log('  └─────────────────────────────────────────────┘\n');

  await client.end();
}

seed().catch((err) => {
  console.error('\n❌  Seed failed:', err);
  process.exit(1);
});
