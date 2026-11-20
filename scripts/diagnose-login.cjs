// diagnose-login.cjs - CommonJS, run from project root
const path = require('path');
// Load pg from project node_modules
const pg = require(path.join('C:\\Users\\hp\\AppData\\Local\\Temp\\taxflow-push\\node_modules\\pg'));
const { Client } = pg;

const DB_URL =
  'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Neon DB\n');

  // 1. Count users
  const { rows: [uc] } = await client.query('SELECT count(*) FROM "user"');
  console.log('Total users:', uc.count);

  // 2. Count credential accounts
  const { rows: [ac] } = await client.query("SELECT count(*) FROM account WHERE provider_id = 'credential'");
  console.log('Credential accounts:', ac.count);

  // 3. Count rra_staff
  const { rows: [sc] } = await client.query('SELECT count(*) FROM rra_staff');
  console.log('RRA staff rows:', sc.count);

  // 4. Find SA-001
  const { rows: saUser } = await client.query(
    "SELECT u.id, u.name, u.username, u.email FROM \"user\" u WHERE u.username ILIKE 'sa-001' LIMIT 1"
  );
  console.log('\nSA-001 user:', saUser[0] || 'NOT FOUND');

  if (saUser[0]) {
    const { rows: saAcc } = await client.query(
      "SELECT id, provider_id, LEFT(password,30) as pwd_start FROM account WHERE user_id = $1",
      [saUser[0].id]
    );
    console.log('SA-001 account rows:', saAcc.length ? saAcc : 'NO ACCOUNT ROW');

    const { rows: saStaff } = await client.query(
      'SELECT id, staff_id, clearance_level, is_active FROM rra_staff WHERE user_id = $1',
      [saUser[0].id]
    );
    console.log('SA-001 rra_staff:', saStaff[0] || 'NO STAFF RECORD');
  }

  // 5. Sample staff
  const { rows: staffSample } = await client.query(
    'SELECT s.staff_id, s.clearance_level, s.is_active, u.username FROM rra_staff s JOIN "user" u ON u.id = s.user_id ORDER BY s.created_at LIMIT 5'
  );
  console.log('\nSample rra_staff:', staffSample.length ? staffSample : 'NONE');

  // 6. Sample traders
  const { rows: traders } = await client.query(
    "SELECT u.name, u.username, u.role, u.tin_number FROM \"user\" u WHERE u.role IN ('manufacturer','wholesaler','retailer') LIMIT 5"
  );
  console.log('\nSample traders:', traders.length ? traders : 'NONE');

  // 7. TIN 100000001
  const { rows: tin1 } = await client.query(
    "SELECT name, username, role, tin_number, clearance_status FROM \"user\" WHERE username = '100000001' OR tin_number = '100000001' LIMIT 1"
  );
  console.log('\nTIN 100000001:', tin1[0] || 'NOT FOUND');

  await client.end();
  console.log('\nDone.');
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
