import pg from 'pg';
import { randomUUID } from 'crypto';
const { Pool } = pg;
const DB = 'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString: DB });

console.log('Creating rra_staff_role table...');

// Create the table matching the Drizzle schema definition
await pool.query(`
  CREATE TABLE IF NOT EXISTS "rra_staff_role" (
    "id"              text PRIMARY KEY,
    "staff_record_id" text NOT NULL REFERENCES "rra_staff"("id") ON DELETE CASCADE,
    "role"            text NOT NULL,
    "assigned_by"     text REFERENCES "user"("id"),
    "assigned_at"     timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "rra_staff_role_staff_role_uniq" UNIQUE ("staff_record_id", "role")
  )
`);
console.log('✅ rra_staff_role table created');

// Create indexes
await pool.query(`CREATE INDEX IF NOT EXISTS "rra_staff_role_role_idx" ON "rra_staff_role"("role")`);
console.log('✅ Indexes created');

// Now check how many rra_staff records exist but have no role assignment
const allStaff = await pool.query('SELECT id, staff_id, clearance_level FROM rra_staff ORDER BY staff_id');
console.log(`\nFound ${allStaff.rows.length} staff records. Adding role assignments...`);

let inserted = 0;
for (const staff of allStaff.rows) {
  // Use clearance_level as the initial role assignment
  if (staff.clearance_level) {
    await pool.query(
      `INSERT INTO "rra_staff_role" ("id", "staff_record_id", "role", "assigned_at")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("staff_record_id", "role") DO NOTHING`,
      [randomUUID(), staff.id, staff.clearance_level]
    );
    inserted++;
  }
}
console.log(`✅ Inserted ${inserted} role assignments (one per staff member using their clearance_level)`);

// Verify SA-001
const sa001 = await pool.query(
  `SELECT sr.staff_id, sr.clearance_level, r.role 
   FROM rra_staff sr 
   JOIN rra_staff_role r ON r.staff_record_id = sr.id 
   WHERE sr.staff_id = 'SA-001'`
);
console.log('\nSA-001 roles:', sa001.rows);

await pool.end();
console.log('\nDone! ✅');
