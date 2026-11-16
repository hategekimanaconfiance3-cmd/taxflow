/**
 * Explicitly reset disposable non-production credential accounts.
 * This script cannot run against production or an unconfirmed database target.
 */

import { hashPassword } from '@better-auth/utils/password';
import pg from 'pg';
import 'dotenv/config';
import { disposableDatabaseUrl, requireMutationConfirmation } from './safety.mjs';

const { Client } = pg;
const DATABASE_URL = disposableDatabaseUrl();
const NEW_PASSWORD = process.env.TAXFLOW_NEW_PASSWORD;
requireMutationConfirmation('TAXFLOW_CONFIRM_PASSWORD_RESET', 'RESET_NONPRODUCTION_ACCOUNTS');
if (!NEW_PASSWORD || NEW_PASSWORD.length < 12) throw new Error('Set TAXFLOW_NEW_PASSWORD to at least 12 characters.');

async function main() {
  const hashed = await hashPassword(NEW_PASSWORD);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows: accounts } = await client.query(`
      SELECT a.id, u.email, u.name, u.username
      FROM account a
      JOIN "user" u ON u.id = a.user_id
      WHERE a.provider_id = 'credential'
      ORDER BY u.email
    `);
    if (accounts.length === 0) {
      console.log('No credential accounts found. Nothing to update.');
      return;
    }
    console.log(`Found ${accounts.length} credential accounts to update.`);
    const result = await client.query('UPDATE account SET password = $1 WHERE provider_id = \'credential\'', [hashed]);
    console.log(`Updated ${result.rowCount} credential account(s) without displaying the new password.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Password reset failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
