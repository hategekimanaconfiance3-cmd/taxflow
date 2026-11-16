import pg from 'pg';
import 'dotenv/config';
import { disposableDatabaseUrl, requireMutationConfirmation } from './safety.mjs';
const { Pool } = pg;
requireMutationConfirmation('TAXFLOW_CONFIRM_SCHEMA_REPAIR', 'ADD_BUSINESS_TYPE_TO_DISPOSABLE_DB');
const pool = new Pool({ connectionString: disposableDatabaseUrl() });

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
