/**
 * update-passwords.mjs
 *
 * Updates ALL existing credential-account passwords in the Neon DB to: Conf123%
 * Uses the exact same scrypt hashing that better-auth uses internally.
 *
 * Run with:  node scripts/update-passwords.mjs
 */

import { hashPassword } from '@better-auth/utils/password';
import pg from 'pg';

const { Client } = pg;

const DATABASE_URL =
  'postgresql://neondb_owner:npg_Hv6dFJ3QonEi@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const NEW_PASSWORD = 'Conf123%';

async function main() {
  console.log('🔐 Hashing new password...');
  const hashed = await hashPassword(NEW_PASSWORD);
  console.log('✅ Hash generated\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('✅ Connected to Neon DB\n');

  try {
    // List all accounts that will be updated
    const { rows: accounts } = await client.query(`
      SELECT a.id, a.user_id, u.email, u.name, u.username
      FROM account a
      JOIN "user" u ON u.id = a.user_id
      WHERE a.provider_id = 'credential'
      ORDER BY u.email
    `);

    if (accounts.length === 0) {
      console.log('⚠️  No credential accounts found. Nothing to update.');
      return;
    }

    console.log(`📋 Found ${accounts.length} credential accounts to update:\n`);
    for (const acc of accounts) {
      console.log(`  • ${acc.name} — username: ${acc.username}`);
    }

    // Update all passwords at once
    const result = await client.query(`
      UPDATE account
      SET password = $1
      WHERE provider_id = 'credential'
    `, [hashed]);

    console.log(`\n✅ Successfully updated ${result.rowCount} password(s)!`);
    console.log('\n────────────────────────────────────────');
    console.log('📌 All users can now log in with:');
    console.log('   New Password: Conf123%');
    console.log('\n📌 RRA Staff login → /admin-login');
    console.log('   Username: their Staff ID (e.g. SA-001, CO-001, AO-001...)');
    console.log('\n📌 Traders login → /sign-in');
    console.log('   Username: their TIN number (e.g. 101000001, 102000005...)');
    console.log('────────────────────────────────────────\n');

  } finally {
    await client.end();
    console.log('🔒 DB connection closed.');
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
