/**
 * TaxFlow Rwanda — Test Accounts Seed
 * ====================================
 * Creates 10 test merchant accounts and verifies/updates the SA-001 RRA staff account.
 *
 * SAFETY GUARDS:
 *  - Blocked in production (NODE_ENV=production throws immediately)
 *  - Requires TAXFLOW_SEED_PASSWORD env var (min 8 chars)
 *  - Idempotent: safe to run multiple times
 *  - Never stores plaintext passwords — uses better-auth's hashPassword
 *  - Does NOT delete existing transactions, inventory, or audit history
 */

import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, or } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { user, account, rraStaff } from '../schema';
import crypto from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  throw new Error('[test-accounts.seed] Seeding is disabled in production.');
}

if (!process.env.DATABASE_URL) {
  throw new Error('[test-accounts.seed] DATABASE_URL environment variable is required.');
}

const RAW_PASSWORD = process.env.TAXFLOW_SEED_PASSWORD || 'Conf123%';
if (RAW_PASSWORD.length < 8) {
  throw new Error('[test-accounts.seed] Set TAXFLOW_SEED_PASSWORD to at least 8 characters.');
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

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
  tinNumber: string;
  businessName: string;
  role: 'manufacturer' | 'wholesaler' | 'retailer';
  clearanceStatus: 'approved';
}

const MERCHANTS: MerchantSeed[] = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  const padded = String(n).padStart(2, '0');
  const role = ROLES[i];
  const tin = n < 10 ? `10000000${n}` : `1000000${n}`;

  return {
    id: crypto.randomUUID(),
    name: `Test Merchant ${padded}`,
    email: `merchant${padded}@taxflow.test`,
    phone: `+25078800${padded}00`,
    nationalId: `119900${padded}00000000`,
    tinNumber: tin,
    businessName: `Test ${role.charAt(0).toUpperCase() + role.slice(1)} ${padded} ${BUSINESS_LABELS[role]}`,
    role,
    clearanceStatus: 'approved',
  };
});

const RRA_ADMIN = {
  id: crypto.randomUUID(),
  name: 'Jean-Pierre Habimana',
  email: 'jean-pierre.habimana@rra.gov.rw',
  staffId: 'SA-001',
  department: 'Administration',
  clearanceLevel: 'super_admin' as const,
};

async function seed() {
  console.log('\n🚀  TaxFlow — Test Accounts Seed');
  console.log('='.repeat(50));

  const hashed = await hashPassword(RAW_PASSWORD);

  console.log('\n📦  Processing 10 test merchant accounts…\n');
  let merchantsCreated = 0;
  let merchantsUpdated = 0;

  for (const m of MERCHANTS) {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(or(eq(user.tinNumber, m.tinNumber), eq(user.username, m.tinNumber)))
      .limit(1);

    if (existing) {
      await db
        .update(account)
        .set({ password: hashed })
        .where(eq(account.userId, existing.id));
      console.log(`  ℹ️   TIN ${m.tinNumber} already exists — password updated to Conf123%`);
      merchantsUpdated++;
      continue;
    }

    await db.insert(user).values({
      id: m.id,
      name: m.name,
      email: m.email,
      emailVerified: true,
      phoneNumber: m.phone,
      phoneNumberVerified: false,
      nationalId: m.nationalId,
      tinNumber: m.tinNumber,
      username: m.tinNumber,
      displayUsername: m.tinNumber,
      businessName: m.businessName,
      role: m.role,
      clearanceStatus: m.clearanceStatus,
      isActive: true,
    });

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

  console.log('\n🛡️   Ensuring RRA staff account SA-001…\n');

  const [existingStaff] = await db
    .select({ id: rraStaff.id, userId: rraStaff.userId })
    .from(rraStaff)
    .where(eq(rraStaff.staffId, RRA_ADMIN.staffId))
    .limit(1);

  if (existingStaff) {
    await db
      .update(account)
      .set({ password: hashed })
      .where(eq(account.userId, existingStaff.userId));
    console.log(`  ✅  SA-001 already exists (userId: ${existingStaff.userId}) — password updated to Conf123%`);
  } else {
    let adminUserId: string;

    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(
        or(
          eq(user.email, RRA_ADMIN.email),
          eq(user.username, 'sa-001'),
          eq(user.username, 'SA-001'),
        ),
      )
      .limit(1);

    if (existingUser) {
      adminUserId = existingUser.id;
      await db
        .update(account)
        .set({ password: hashed })
        .where(eq(account.userId, adminUserId));
      console.log(`  ℹ️   User for SA-001 exists — reused & password updated`);
    } else {
      adminUserId = RRA_ADMIN.id;

      await db.insert(user).values({
        id: adminUserId,
        name: RRA_ADMIN.name,
        email: RRA_ADMIN.email,
        emailVerified: true,
        username: 'sa-001',
        displayUsername: 'SA-001',
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

  console.log('\n' + '='.repeat(50));
  console.log('✅  Seed complete successfully!\n');
  console.log(`  Merchants created : ${merchantsCreated}`);
  console.log(`  Merchants updated : ${merchantsUpdated}`);
  console.log('\n  Login credentials:');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  MERCHANTS — login at /sign-in              │');
  console.log('  │  TIN: 100000001 … 100000010                 │');
  console.log('  │  Password: Conf123%                         │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │  RRA STAFF — login at /admin-login          │');
  console.log('  │  Staff ID: SA-001                           │');
  console.log('  │  Password: Conf123%                         │');
  console.log('  └─────────────────────────────────────────────┘\n');

  await client.end();
}

seed().catch((err) => {
  console.error('\n❌  Seed failed:', err);
  process.exit(1);
});
