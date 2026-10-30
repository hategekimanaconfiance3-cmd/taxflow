import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import type db from '../../db/drizzle';
import { pollDueSimulatedPayments } from '../../lib/payment-engine/polling';

async function main(): Promise<void> {
  const paymentId = process.argv[2];
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId) || !databaseUrl) {
    throw new Error('A fixture payment ID and TEST_DATABASE_URL are required.');
  }
  const client = postgres(databaseUrl);
  try {
    const testDatabase = drizzle(client, { schema });
    const summary = await pollDueSimulatedPayments(10, testDatabase as unknown as typeof db, paymentId);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Payment poll worker failed.');
  process.exitCode = 1;
});
