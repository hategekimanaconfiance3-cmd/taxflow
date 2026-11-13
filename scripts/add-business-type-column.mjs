import pg from 'pg';
const { Pool } = pg;
const DB = 'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString: DB });

console.log('Adding missing business_type column to user table...');

// Add the column with the same default as the schema definition
await pool.query(`
  ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "business_type" text NOT NULL DEFAULT 'registered_business'
`);
console.log('✓ business_type column added');

// Verify
const check = await pool.query(
  "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'business_type'"
);
console.log('Verify:', check.rows);

await pool.end();
console.log('Done!');
