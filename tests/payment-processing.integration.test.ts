import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
function localDisposableUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
      && /(?:test|testing|disposable)/i.test(decodeURIComponent(url.pathname));
  } catch { return false; }
}
const safeUrl = localDisposableUrl(databaseUrl) ? databaseUrl : undefined;
const skipReason = 'Requires TEST_DATABASE_URL for a disposable localhost PostgreSQL database named test/testing/disposable.';
const providerNames = ['mtn_mobile_money', 'airtel_money', 'bank_gateway'] as const;
type ProviderName = (typeof providerNames)[number];

for (const [index, provider] of providerNames.entries()) {
  const prefix = provider === 'mtn_mobile_money' ? 'MTN_SIM' : provider === 'airtel_money' ? 'AIRTEL_SIM' : 'BANK_SIM';
  process.env[`${prefix}_BASE_URL`] = `https://${provider}.taxflow.invalid`;
  process.env[`${prefix}_CLIENT_ID`] = `test-client-${index}`;
  process.env[`${prefix}_CLIENT_SECRET`] = `test-secret-${index}`;
  process.env[`${prefix}_API_KEY`] = `test-key-${index}`;
  process.env[`${prefix}_CALLBACK_SECRET`] = `test-callback-secret-${index}-at-least-32-characters`;
  process.env[`${prefix}_SCENARIO`] = 'success';
}
process.env.PAYMENT_PROVIDER_MODE = 'simulation';

interface Fixture {
  taxpayerId: string;
  assessorId: string;
  approverId: string;
  obligationId: string;
  paymentId: string;
  providerReference: string;
  paymentReference: string;
}

async function createFixture(database: ReturnType<typeof drizzle>, provider: ProviderName, scenario = 'success'): Promise<Fixture> {
  const taxpayerId = randomUUID();
  const assessorId = randomUUID();
  const approverId = randomUUID();
  const obligationId = randomUUID();
  const paymentId = randomUUID();
  const providerReference = `${provider.toUpperCase()}-${randomUUID()}`;
  const paymentReference = `TF-${randomUUID()}`;
  await database.insert(schema.user).values([
    { id: taxpayerId, name: 'Payment lifecycle integration taxpayer', email: `${taxpayerId}@example.test`, role: 'retailer' },
    { id: assessorId, name: 'Payment lifecycle assessor', email: `${assessorId}@example.test`, role: 'rra_staff' },
    { id: approverId, name: 'Payment lifecycle approver', email: `${approverId}@example.test`, role: 'rra_staff' },
  ]);
  await database.insert(schema.taxObligation).values({
    id: obligationId, taxpayerId, taxType: 'VAT', periodKey: '2026-Q3', assessmentReference: `RRA-${randomUUID()}`,
    assessmentSource: 'OFFICIAL_RRA', assessmentDate: new Date('2026-10-01T00:00:00Z'), originalAmount: '100.00',
    currency: 'RWF', status: 'PAYABLE', supportingEvidenceReference: 'payment integration fixture evidence',
    createdBy: assessorId, finalizedBy: assessorId, approvedBy: approverId, approvedAt: new Date(),
  });
  await database.insert(schema.taxPayment).values({
    id: paymentId, businessId: taxpayerId, obligationId, amount: 100, currency: 'RWF', method: provider === 'bank_gateway' ? 'bank_transfer' : 'mobile_money',
    paymentReference, idempotencyKey: randomUUID(), status: 'pending', workflowStatus: 'PAYMENT_INITIATED',
    provider, providerReference, providerRequestReference: paymentReference, providerStatus: 'pending', simulationScenario: scenario,
    initiatedAt: new Date(), nextRetryAt: new Date(Date.now() - 60_000), retryCount: 0, expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  return { taxpayerId, assessorId, approverId, obligationId, paymentId, providerReference, paymentReference };
}

async function cleanFixture(client: ReturnType<typeof postgres>, database: ReturnType<typeof drizzle>, fixture: Fixture): Promise<void> {
  await client.unsafe('ALTER TABLE tax_payment_event DISABLE TRIGGER tax_payment_event_append_only');
  await client.unsafe('ALTER TABLE tax_payment_provider_event DISABLE TRIGGER tax_payment_provider_event_append_only');
  await client.unsafe('ALTER TABLE tax_payment_receipt DISABLE TRIGGER tax_payment_receipt_append_only');
  await client.unsafe('ALTER TABLE tax_period_payment_score_snapshot DISABLE TRIGGER tax_period_payment_score_append_only');
  await database.delete(schema.taxPaymentEvent).where(eq(schema.taxPaymentEvent.paymentId, fixture.paymentId));
  await database.delete(schema.taxPaymentProviderEvent).where(eq(schema.taxPaymentProviderEvent.paymentId, fixture.paymentId));
  await database.delete(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, fixture.paymentId));
  await database.delete(schema.taxPeriodPaymentScoreSnapshot).where(and(
    eq(schema.taxPeriodPaymentScoreSnapshot.taxpayerId, fixture.taxpayerId),
    eq(schema.taxPeriodPaymentScoreSnapshot.periodKey, '2026-Q3'),
  ));
  await database.delete(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
  await database.delete(schema.taxObligation).where(eq(schema.taxObligation.id, fixture.obligationId));
  await database.delete(schema.user).where(eq(schema.user.id, fixture.taxpayerId));
  await database.delete(schema.user).where(eq(schema.user.id, fixture.assessorId));
  await database.delete(schema.user).where(eq(schema.user.id, fixture.approverId));
  await client.unsafe('ALTER TABLE tax_payment_event ENABLE TRIGGER tax_payment_event_append_only');
  await client.unsafe('ALTER TABLE tax_payment_provider_event ENABLE TRIGGER tax_payment_provider_event_append_only');
  await client.unsafe('ALTER TABLE tax_payment_receipt ENABLE TRIGGER tax_payment_receipt_append_only');
  await client.unsafe('ALTER TABLE tax_period_payment_score_snapshot ENABLE TRIGGER tax_period_payment_score_append_only');
}

test('each simulated provider settles once under concurrent callback replay and issues one receipt', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const database = drizzle(client, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const [{ getSimulatedProvider }, { reconcileProviderCallback }] = await Promise.all([
    import('../lib/payment-engine/provider'), import('../lib/payment-engine/reconcile'),
  ]);
  const fixtures: Fixture[] = [];
  try {
    for (const providerName of providerNames) {
      const fixture = await createFixture(database, providerName);
      fixtures.push(fixture);
      const adapter = getSimulatedProvider(providerName);
      const context = {
        paymentReference: fixture.paymentReference, providerReference: fixture.providerReference,
        taxpayerReference: fixture.taxpayerId, obligationId: fixture.obligationId, amount: 100, currency: 'RWF',
      };
      const callback = await adapter.makeCallback(context, 'success');
      const runtimeDatabase = database as unknown as typeof import('../db/drizzle').default;
      const concurrentResults = await Promise.all([
        reconcileProviderCallback(providerName, callback.body, callback.signature, runtimeDatabase),
        reconcileProviderCallback(providerName, callback.body, callback.signature, runtimeDatabase),
      ]);
      assert.equal(concurrentResults.filter((result) => result === 'settled').length, 1);
      assert.equal(concurrentResults.filter((result) => result === 'duplicate').length, 1);
      const [payment] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
      assert.equal(payment.status, 'confirmed');
      assert.equal(payment.workflowStatus, 'PAID');
      const receipts = await database.select().from(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, fixture.paymentId));
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].verificationStatus, 'VERIFIED');
      assert.equal(receipts[0].amount, 100);
      assert.equal(await reconcileProviderCallback(providerName, callback.body, callback.signature, runtimeDatabase), 'duplicate');
    }
  } finally {
    for (const fixture of fixtures.reverse()) await cleanFixture(client, database, fixture);
    await client.end();
  }
});

test('a validly signed amount mismatch is held for review without a receipt', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const database = drizzle(client, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const [{ getSimulatedProvider }, { reconcileProviderCallback }] = await Promise.all([
    import('../lib/payment-engine/provider'), import('../lib/payment-engine/reconcile'),
  ]);
  const fixture = await createFixture(database, 'mtn_mobile_money');
  try {
    const provider = getSimulatedProvider('mtn_mobile_money');
    const callback = await provider.makeCallback({
      paymentReference: fixture.paymentReference, providerReference: fixture.providerReference,
      taxpayerReference: fixture.taxpayerId, obligationId: fixture.obligationId, amount: 101, currency: 'RWF',
    }, 'success');
    const runtimeDatabase = database as unknown as typeof import('../db/drizzle').default;
    assert.equal(await reconcileProviderCallback('mtn_mobile_money', callback.body, callback.signature, runtimeDatabase), 'review_required');
    const [payment] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
    assert.equal(payment.workflowStatus, 'REVIEW_REQUIRED');
    assert.equal((await database.select().from(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, fixture.paymentId))).length, 0);
  } finally {
    await cleanFixture(client, database, fixture);
    await client.end();
  }
});

test('invalid authentication, currency, taxpayer, and unknown references never settle', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const database = drizzle(client, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const [{ getSimulatedProvider }, { reconcileProviderCallback }] = await Promise.all([
    import('../lib/payment-engine/provider'), import('../lib/payment-engine/reconcile'),
  ]);
  const fixtures: Fixture[] = [];
  try {
    const runtimeDatabase = database as unknown as typeof import('../db/drizzle').default;
    const invalidSignatureFixture = await createFixture(database, 'mtn_mobile_money');
    fixtures.push(invalidSignatureFixture);
    const mtn = getSimulatedProvider('mtn_mobile_money');
    const valid = await mtn.makeCallback({
      paymentReference: invalidSignatureFixture.paymentReference,
      providerReference: invalidSignatureFixture.providerReference,
      taxpayerReference: invalidSignatureFixture.taxpayerId,
      obligationId: invalidSignatureFixture.obligationId, amount: 100, currency: 'RWF',
    }, 'success');
    await assert.rejects(reconcileProviderCallback('mtn_mobile_money', valid.body, '0'.repeat(64), runtimeDatabase), /authentication failed/);
    const [untouched] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, invalidSignatureFixture.paymentId));
    assert.equal(untouched.status, 'pending');
    assert.equal(untouched.workflowStatus, 'PAYMENT_INITIATED');
    assert.equal((await database.select().from(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, invalidSignatureFixture.paymentId))).length, 0);

    const currencyFixture = await createFixture(database, 'airtel_money');
    fixtures.push(currencyFixture);
    const airtel = getSimulatedProvider('airtel_money');
    const wrongCurrency = await airtel.makeCallback({
      paymentReference: currencyFixture.paymentReference, providerReference: currencyFixture.providerReference,
      taxpayerReference: currencyFixture.taxpayerId, obligationId: currencyFixture.obligationId, amount: 100, currency: 'USD',
    }, 'success');
    assert.equal(await reconcileProviderCallback('airtel_money', wrongCurrency.body, wrongCurrency.signature, runtimeDatabase), 'review_required');

    const taxpayerFixture = await createFixture(database, 'bank_gateway');
    fixtures.push(taxpayerFixture);
    const bank = getSimulatedProvider('bank_gateway');
    const wrongTaxpayer = await bank.makeCallback({
      paymentReference: taxpayerFixture.paymentReference, providerReference: taxpayerFixture.providerReference,
      taxpayerReference: randomUUID(), obligationId: taxpayerFixture.obligationId, amount: 100, currency: 'RWF',
    }, 'success');
    assert.equal(await reconcileProviderCallback('bank_gateway', wrongTaxpayer.body, wrongTaxpayer.signature, runtimeDatabase), 'review_required');

    const unknown = await mtn.makeCallback({
      paymentReference: 'TF-unknown', providerReference: `MTN_MOBILE_MONEY-${randomUUID()}`,
      taxpayerReference: randomUUID(), obligationId: randomUUID(), amount: 100, currency: 'RWF',
    }, 'success');
    assert.equal(await reconcileProviderCallback('mtn_mobile_money', unknown.body, unknown.signature, runtimeDatabase), 'unknown');
  } finally {
    for (const fixture of fixtures.reverse()) await cleanFixture(client, database, fixture);
    await client.end();
  }
});

test('concurrent polling workers cannot claim or settle one payment twice', { skip: safeUrl ? false : skipReason }, async () => {
  const clientA = postgres(safeUrl!);
  const clientB = postgres(safeUrl!);
  const databaseA = drizzle(clientA, { schema });
  const databaseB = drizzle(clientB, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const [{ pollDueSimulatedPayments }] = await Promise.all([import('../lib/payment-engine/polling')]);
  const fixture = await createFixture(databaseA, 'mtn_mobile_money');
  try {
    const runtimeA = databaseA as unknown as typeof import('../db/drizzle').default;
    const runtimeB = databaseB as unknown as typeof import('../db/drizzle').default;
    const summaries = await Promise.all([
      pollDueSimulatedPayments(10, runtimeA),
      pollDueSimulatedPayments(10, runtimeB),
    ]);
    assert.equal(summaries.reduce((total, summary) => total + summary.claimed, 0), 1);
    assert.equal(summaries.reduce((total, summary) => total + summary.settled, 0), 1);
    assert.equal((await databaseA.select().from(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, fixture.paymentId))).length, 1);
  } finally {
    await cleanFixture(clientA, databaseA, fixture);
    await clientA.end();
    await clientB.end();
  }
});

test('delayed simulator confirmation survives polling calls and settles from persisted retry state', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const database = drizzle(client, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const [{ pollDueSimulatedPayments }, { getSimulatedProvider }] = await Promise.all([
    import('../lib/payment-engine/polling'), import('../lib/payment-engine/provider'),
  ]);
  const fixture = await createFixture(database, 'airtel_money', 'delayed');
  try {
    const runtimeDatabase = database as unknown as typeof import('../db/drizzle').default;
    const first = await pollDueSimulatedPayments(10, runtimeDatabase, fixture.paymentId);
    const firstEvents = await database.select({ eventType: schema.taxPaymentProviderEvent.eventType, classification: schema.taxPaymentProviderEvent.classification }).from(schema.taxPaymentProviderEvent).where(eq(schema.taxPaymentProviderEvent.paymentId, fixture.paymentId));
    assert.equal(first.pending, 1, `Expected a pending confirmation; poll summary was ${JSON.stringify(first)} and events ${JSON.stringify(firstEvents)}`);
    await database.update(schema.taxPayment).set({ nextRetryAt: new Date(Date.now() - 1_000) }).where(eq(schema.taxPayment.id, fixture.paymentId));
    // A new Node process proves the retry state is recovered from PostgreSQL,
    // rather than from the first worker's memory.
    const restartedWorker = spawnSync(process.execPath, [
      'node_modules/tsx/dist/cli.mjs', 'tests/fixtures/payment-poll-worker.ts', fixture.paymentId,
    ], { cwd: process.cwd(), env: { ...process.env }, encoding: 'utf8', timeout: 30_000 });
    assert.equal(restartedWorker.status, 0, restartedWorker.stderr || restartedWorker.error?.message);
    const second = JSON.parse(restartedWorker.stdout.trim().split(/\r?\n/).at(-1) ?? '{}') as { claimed: number; settled: number };
    assert.equal(second.claimed, 1);
    assert.equal(second.settled, 1);
    const [payment] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
    assert.equal(payment.workflowStatus, 'PAID');
    assert.equal(payment.retryCount, 2);
    const context = {
      paymentReference: fixture.paymentReference, providerReference: fixture.providerReference,
      taxpayerReference: fixture.taxpayerId, obligationId: fixture.obligationId, amount: 100, currency: 'RWF',
    };
    assert.equal((await getSimulatedProvider('airtel_money').inquireStatus(context, 'success')).status, 'success');
  } finally {
    await cleanFixture(client, database, fixture);
    await client.end();
  }
});

test('each simulated provider failure and expiration is terminal and never creates a receipt', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const database = drizzle(client, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const [{ getSimulatedProvider }, { reconcileProviderCallback }] = await Promise.all([
    import('../lib/payment-engine/provider'), import('../lib/payment-engine/reconcile'),
  ]);
  const fixtures: Fixture[] = [];
  try {
    const runtimeDatabase = database as unknown as typeof import('../db/drizzle').default;
    for (const providerName of providerNames) {
      for (const outcome of ['failed', 'expired'] as const) {
        const fixture = await createFixture(database, providerName);
        fixtures.push(fixture);
        const callback = await getSimulatedProvider(providerName).makeCallback({
          paymentReference: fixture.paymentReference, providerReference: fixture.providerReference,
          taxpayerReference: fixture.taxpayerId, obligationId: fixture.obligationId, amount: 100, currency: 'RWF',
        }, outcome);
        assert.equal(await reconcileProviderCallback(providerName, callback.body, callback.signature, runtimeDatabase), 'failed');
        const [payment] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
        assert.equal(payment.workflowStatus, outcome === 'failed' ? 'FAILED' : 'EXPIRED');
        assert.equal(payment.status, 'rejected');
        assert.equal((await database.select().from(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, fixture.paymentId))).length, 0);
      }
    }
  } finally {
    for (const fixture of fixtures.reverse()) await cleanFixture(client, database, fixture);
    await client.end();
  }
});

test('unknown obligation callbacks are held for review without settling', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const database = drizzle(client, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const [{ getSimulatedProvider }, { reconcileProviderCallback }] = await Promise.all([
    import('../lib/payment-engine/provider'), import('../lib/payment-engine/reconcile'),
  ]);
  const fixture = await createFixture(database, 'bank_gateway');
  try {
    const callback = await getSimulatedProvider('bank_gateway').makeCallback({
      paymentReference: fixture.paymentReference, providerReference: fixture.providerReference,
      taxpayerReference: fixture.taxpayerId, obligationId: randomUUID(), amount: 100, currency: 'RWF',
    }, 'success');
    const runtimeDatabase = database as unknown as typeof import('../db/drizzle').default;
    assert.equal(await reconcileProviderCallback('bank_gateway', callback.body, callback.signature, runtimeDatabase), 'review_required');
    const [payment] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
    assert.equal(payment.workflowStatus, 'REVIEW_REQUIRED');
    assert.equal((await database.select().from(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, fixture.paymentId))).length, 0);
  } finally {
    await cleanFixture(client, database, fixture);
    await client.end();
  }
});

test('provider outage retries are durable, back off, and stop at the configured limit', { skip: safeUrl ? false : skipReason }, async () => {
  const client = postgres(safeUrl!);
  const database = drizzle(client, { schema });
  process.env.DATABASE_URL = safeUrl!;
  const previousLimit = process.env.PAYMENT_SIM_MAX_RETRIES;
  process.env.PAYMENT_SIM_MAX_RETRIES = '1';
  const [{ pollDueSimulatedPayments }] = await Promise.all([import('../lib/payment-engine/polling')]);
  const fixture = await createFixture(database, 'mtn_mobile_money', 'unavailable');
  try {
    const runtimeDatabase = database as unknown as typeof import('../db/drizzle').default;
    const first = await pollDueSimulatedPayments(10, runtimeDatabase);
    assert.equal(first.failed, 1);
    const [retrying] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
    assert.equal(retrying.retryCount, 1);
    assert.ok(retrying.nextRetryAt && retrying.nextRetryAt.getTime() > Date.now());

    await database.update(schema.taxPayment).set({ nextRetryAt: new Date(Date.now() - 1_000) }).where(eq(schema.taxPayment.id, fixture.paymentId));
    const second = await pollDueSimulatedPayments(10, runtimeDatabase);
    assert.equal(second.failed, 1);
    const [expired] = await database.select().from(schema.taxPayment).where(eq(schema.taxPayment.id, fixture.paymentId));
    assert.equal(expired.retryCount, 2);
    assert.equal(expired.workflowStatus, 'EXPIRED');
    assert.equal(expired.nextRetryAt, null);
    assert.equal((await database.select().from(schema.taxPaymentReceipt).where(eq(schema.taxPaymentReceipt.paymentId, fixture.paymentId))).length, 0);
    const events = await database.select({ eventType: schema.taxPaymentProviderEvent.eventType }).from(schema.taxPaymentProviderEvent).where(eq(schema.taxPaymentProviderEvent.paymentId, fixture.paymentId));
    assert.ok(events.some((event) => event.eventType === 'STATUS_INQUIRY_FAILURE'));
    assert.ok(events.some((event) => event.eventType === 'POLLING_STOPPED'));
  } finally {
    if (previousLimit === undefined) delete process.env.PAYMENT_SIM_MAX_RETRIES;
    else process.env.PAYMENT_SIM_MAX_RETRIES = previousLimit;
    await cleanFixture(client, database, fixture);
    await client.end();
  }
});
