import pg from 'pg';
import { verifyPassword } from '@better-auth/utils/password';
import 'dotenv/config';
import { requiredEnv } from './safety.mjs';

const { Client } = pg;
const client = new Client({
  connectionString: requiredEnv('DATABASE_URL'),
});
await client.connect();

const { rows: providers } = await client.query('SELECT DISTINCT provider_id, count(*) FROM account GROUP BY provider_id');
console.log('Provider IDs in account table:', providers);

const { rows: users } = await client.query('SELECT id, name, username, email FROM "user" WHERE username = $1 LIMIT 1', ['sa-001']);
console.log('\nSA-001 user:', users[0] ?? 'NOT FOUND');

if (users[0]) {
  const { rows: accounts } = await client.query('SELECT id, provider_id, password FROM account WHERE user_id = $1', [users[0].id]);
  console.log('\nSA-001 accounts:', accounts.map((account) => ({ provider_id: account.provider_id, hasPassword: Boolean(account.password) })));

  const suppliedPassword = process.env.TAXFLOW_VERIFY_PASSWORD;
  if (accounts[0]?.password && suppliedPassword) {
    const ok = await verifyPassword(accounts[0].password, suppliedPassword);
    console.log('\nPassword verification:', ok ? 'CORRECT' : 'WRONG');
  } else if (accounts[0]?.password) {
    console.log('\nPassword verification skipped; set TAXFLOW_VERIFY_PASSWORD explicitly to verify.');
  }
}

await client.end();
