/**
 * diagnose-login.mjs
 * Run from the taxflow-push root: node scripts/diagnose-login.mjs
 * Checks whether SA-001 and trader TINs exist in Neon and verifies password hashes.
 */
import pg from 'pg';

const { Client } = pg;
const DB_URL =
  'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('✅ Connected to Neon DB\n');

// 1. Count users
const { rows: [userCount] } = await client.query('SELECT count(*) FROM "user"');
console.log('Total users in DB:', userCount.count);

// 2. Count accounts
const { rows: [accCount] } = await client.query('SELECT count(*) FROM account WHERE provider_id = \'credential\'');
console.log('Total credential accounts:', accCount.count);

// 3. Count rra_staff
const { rows: [staffCount] } = await client.query('SELECT count(*) FROM rra_staff');
console.log('Total rra_staff rows:', staffCount.count);

// 4. Find SA-001
const { rows: saUser } = await client.query(
  'SELECT u.id, u.name, u.username, u.email FROM "user" u WHERE u.username ILIKE \'sa-001\' LIMIT 1'
);
console.log('\nSA-001 user record:', saUser[0] ?? '❌ NOT FOUND');

if (saUser[0]) {
  const { rows: saAcc } = await client.query(
    'SELECT id, provider_id, LEFT(password,30) as pwd_start FROM account WHERE user_id = $1',
    [saUser[0].id]
  );
  console.log('SA-001 account rows:', saAcc.length ? saAcc : '❌ NO ACCOUNT');

  const { rows: saStaff } = await client.query(
    'SELECT id, staff_id, clearance_level, is_active FROM rra_staff WHERE user_id = $1',
    [saUser[0].id]
  );
  console.log('SA-001 rra_staff:', saStaff[0] ?? '❌ NO STAFF RECORD');
}

// 5. List first 5 rra_staff records (with usernames)
const { rows: staffSample } = await client.query(`
  SELECT s.staff_id, s.clearance_level, s.is_active, u.username, u.email
  FROM rra_staff s JOIN "user" u ON u.id = s.user_id
  ORDER BY s.created_at LIMIT 5
`);
console.log('\nSample rra_staff records:', staffSample.length ? staffSample : '❌ NONE');

// 6. List first 5 traders (non-staff users) with their TINs
const { rows: traders } = await client.query(`
  SELECT u.id, u.name, u.username, u.role, u.tin_number, u.clearance_status
  FROM "user" u
  WHERE u.role IN ('manufacturer','wholesaler','retailer')
  ORDER BY u.created_at LIMIT 5
`);
console.log('\nSample trader users (first 5):', traders.length ? traders : '❌ NONE');

// 7. Check if TIN 100000001 exists
const { rows: tin1 } = await client.query(
  'SELECT id, name, username, role, tin_number, clearance_status FROM "user" WHERE username = $1 OR tin_number = $1 LIMIT 1',
  ['100000001']
);
console.log('\nTIN 100000001 user:', tin1[0] ?? '❌ NOT FOUND');

await client.end();
console.log('\n✅ Diagnosis complete.');
