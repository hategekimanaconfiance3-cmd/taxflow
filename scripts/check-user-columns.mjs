import pg from 'pg';
const { Pool } = pg;
const DB = 'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString: DB });

// Check columns in user table
const cols = await pool.query(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user' ORDER BY ordinal_position"
);
console.log('=== user table columns ===');
cols.rows.forEach(r => console.log(' ', r.column_name, r.data_type, r.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)'));

// Cross-check: which columns better-auth needs but might be missing?
const needed = ['id','name','username','display_username','national_id','tin_number','business_name','phone_number','phone_number_verified','role','business_type','clearance_status','email','email_verified','image','is_active','created_at','updated_at'];
const existing = cols.rows.map(r => r.column_name);
const missing = needed.filter(c => !existing.includes(c));
console.log('\n=== MISSING columns (needed by better-auth) ===');
if (missing.length === 0) console.log('  None! All columns present.');
else missing.forEach(c => console.log(' MISSING:', c));

await pool.end();
