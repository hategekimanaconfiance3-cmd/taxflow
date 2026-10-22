import pg from 'pg';
import { verifyPassword } from '@better-auth/utils/password';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Check what provider_ids exist
const { rows: providers } = await client.query(
  "SELECT DISTINCT provider_id, count(*) FROM account GROUP BY provider_id"
);
console.log('Provider IDs in account table:', providers);

// Get SA-001 user and their account
const { rows: user } = await client.query(
  "SELECT id, name, username, email FROM \"user\" WHERE username = 'sa-001' LIMIT 1"
);
console.log('\nSA-001 user:', user[0] ?? 'NOT FOUND');

if (user[0]) {
  const { rows: acc } = await client.query(
    "SELECT id, provider_id, password FROM account WHERE user_id = $1",
    [user[0].id]
  );
  console.log('\nSA-001 accounts:', acc.map(a => ({ provider_id: a.provider_id, hasPassword: !!a.password, passwordStart: a.password?.slice(0, 30) })));

  if (acc[0]?.password) {
    const ok = await verifyPassword(acc[0].password, 'Conf123%');
    console.log('\nPassword verify for Conf123%:', ok ? '✅ CORRECT' : '❌ WRONG');
  }
}

await client.end();
