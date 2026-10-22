import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Check BOTH emailVerified columns for RRA staff
const { rows } = await client.query(`
  SELECT username, "emailVerified", email_verified, is_active, banned, role
  FROM "user"
  WHERE username IN ('sa-001','co-001','co-002','ao-001','ao-002','sm-001','sm-002','cr-001','cr-002','ra-001','ra-002')
  ORDER BY username
`);
console.log('RRA Staff - both email verified columns:');
rows.forEach(r => {
  console.log(`  ${r.username} | emailVerified(camel): ${r.emailVerified} | email_verified(snake): ${r.email_verified} | banned: ${r.banned}`);
});

// Fix: set the camelCase emailVerified = true for ALL users (this is what better-auth checks)
const r1 = await client.query(
  `UPDATE "user" SET "emailVerified" = true WHERE "emailVerified" IS NULL OR "emailVerified" = false`
);
console.log(`\n✅ Fixed "emailVerified" (camelCase) for ${r1.rowCount} users`);

// Also unban any banned users (banned column is camelCase based)
const r2 = await client.query(
  `UPDATE "user" SET banned = false, "banReason" = NULL, "banExpires" = NULL WHERE banned = true`
);
console.log(`✅ Unbanned ${r2.rowCount} users`);

// Verify result
const { rows: after } = await client.query(`
  SELECT username, "emailVerified", banned FROM "user"
  WHERE username IN ('sa-001','co-001','ao-001')
`);
console.log('\nAfter fix:');
after.forEach(r => console.log(`  ${r.username} | emailVerified: ${r.emailVerified} | banned: ${r.banned}`));

await client.end();
console.log('\n🔒 Done.');
