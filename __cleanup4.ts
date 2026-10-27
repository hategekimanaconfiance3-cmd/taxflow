import postgres from "postgres";

const DB_URL = "postgresql://neondb_owner:npg_6XgNdhp1bHjP@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = postgres(DB_URL, { max: 1, ssl: "require" });

const STAFF_IDS = ["rra-user-sa-001","rra-user-co-001","rra-user-co-002","rra-user-ao-001","rra-user-ao-002","rra-user-sm-001","rra-user-sm-002","rra-user-cr-001","rra-user-cr-002","rra-user-ra-001","rra-user-ra-002"];

async function main() {
  // Check the actual session column casing in postgres
  const r = await sql`SELECT "userId" FROM session LIMIT 1`;
  console.log("Test:", r);
  await sql.end();
}
main().catch(async e => { 
  console.error("Session userId error:", e.message);
  // Try lowercase
  const sql2 = postgres(DB_URL, { max: 1, ssl: "require" });
  try {
    const r2 = await sql2`SELECT user_id FROM session LIMIT 1`;
    console.log("user_id works:", r2);
  } catch(e2: any) { console.error("user_id also fails:", e2.message); }
  // Just delete by subquery
  try {
    await sql2`DELETE FROM session WHERE "userId" IN (SELECT id FROM "user" WHERE role = 'rra_staff')`;
    console.log("session deleted via subquery");
    await sql2`DELETE FROM account WHERE "userId" IN (SELECT id FROM "user" WHERE role = 'rra_staff')`;
    console.log("account deleted via subquery");
    await sql2`DELETE FROM "user" WHERE id = ANY(${STAFF_IDS})`;
    console.log("users deleted");
  } catch(e3: any) { console.error("subquery failed:", e3.message); }
  await sql2.end();
});
