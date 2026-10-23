import pg from 'pg';
const { Pool } = pg;
const DB = 'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString: DB });

// Check all auth-related tables
const tables = ['user', 'session', 'account', 'verification', 'rate_limit', 'rra_staff', 'rra_staff_role'];

for (const table of tables) {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  if (cols.rows.length === 0) {
    console.log(`\n❌ TABLE MISSING: ${table}`);
  } else {
    console.log(`\n✅ ${table}: [${cols.rows.map(r => r.column_name).join(', ')}]`);
  }
}

// Check SA-001 rra_staff record
console.log('\n=== SA-001 rra_staff record ===');
const userId = 'e650fae3-5472-4d07-8325-750eaf7bef69'; // from earlier diag
const staff = await pool.query('SELECT * FROM rra_staff WHERE user_id = $1', [userId]);
if (staff.rows.length === 0) {
  console.log('❌ NO rra_staff record for SA-001!');
} else {
  console.log('✅ Found:', JSON.stringify(staff.rows[0], null, 2));
}

// Check session table columns vs what better-auth needs
const sessionCols = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'session'"
);
const needed = ['id', 'expires_at', 'token', 'created_at', 'updated_at', 'ip_address', 'user_agent', 'user_id'];
const existing = sessionCols.rows.map(r => r.column_name);
const missing = needed.filter(c => !existing.includes(c));
console.log('\n=== session table missing columns ===');
console.log(missing.length === 0 ? 'None missing ✅' : '❌ MISSING: ' + missing.join(', '));

// Check rra_staff schema columns
const staffSchema = ['id', 'user_id', 'staff_id', 'clearance_level', 'department', 'is_active', 'created_at', 'updated_at'];
const staffCols = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rra_staff'"
);
const existingStaff = staffCols.rows.map(r => r.column_name);
const missingStaff = staffSchema.filter(c => !existingStaff.includes(c));
console.log('\n=== rra_staff table missing columns ===');
console.log(missingStaff.length === 0 ? 'None missing ✅' : '❌ MISSING: ' + missingStaff.join(', '));

await pool.end();
