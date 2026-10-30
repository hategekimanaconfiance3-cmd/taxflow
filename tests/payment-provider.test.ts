import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSimulatedProvider, type SimulatedProviderName, type SimulationScenario } from '../lib/payment-engine/provider';

const providers: SimulatedProviderName[] = ['mtn_mobile_money', 'airtel_money', 'bank_gateway'];
for (const [index, name] of providers.entries()) {
  const prefix = name === 'mtn_mobile_money' ? 'MTN_SIM' : name === 'airtel_money' ? 'AIRTEL_SIM' : 'BANK_SIM';
  process.env[`${prefix}_BASE_URL`] = `https://${name}.taxflow.invalid`;
  process.env[`${prefix}_CLIENT_ID`] = `dev-client-${index}`;
  process.env[`${prefix}_CLIENT_SECRET`] = `dev-secret-${index}`;
  process.env[`${prefix}_API_KEY`] = `dev-api-key-${index}`;
  process.env[`${prefix}_CALLBACK_SECRET`] = `dev-callback-secret-${index}-with-more-than-32-characters`;
  process.env[`${prefix}_SCENARIO`] = 'pending';
}
process.env.PAYMENT_PROVIDER_MODE = 'simulation';

function input(name: string, scenario: SimulationScenario) {
  return {
    paymentReference: `TF-${name}`, amount: 7500, currency: 'RWF' as const,
    taxpayerReference: 'taxpayer-test', obligationId: 'obligation-test', scenario,
  };
}

for (const providerName of providers) {
  test(`${providerName} simulator is stateless and signs callbacks using persisted transaction context`, async () => {
    const adapter = getSimulatedProvider(providerName);
    const auth = await adapter.authenticate();
    assert.equal(auth.simulated, true);
    assert.match(auth.token, /^sim_/);

    const initiated = await adapter.initiatePayment(input(providerName, 'success'));
    assert.equal(initiated.accepted, true);
    assert.equal(initiated.scenario, 'success');
    const context = {
      paymentReference: `TF-${providerName}`, providerReference: initiated.providerReference,
      taxpayerReference: 'taxpayer-test', obligationId: 'obligation-test', amount: 7500, currency: 'RWF',
    };

    // A fresh adapter instance must be able to process a transaction without local state.
    const restartedAdapter = getSimulatedProvider(providerName);
    assert.equal((await restartedAdapter.authorize(context, initiated.scenario)).status, 'success');
    assert.equal((await restartedAdapter.inquireStatus(context, initiated.scenario)).status, 'success');
    const callback = await restartedAdapter.makeCallback(context, 'success');
    const verified = await restartedAdapter.verifyCallback(callback.body, callback.signature);
    assert.equal(verified.providerReference, initiated.providerReference);
    await assert.rejects(restartedAdapter.verifyCallback(callback.body, '0'.repeat(64)), /authentication failed/);
    await assert.rejects(restartedAdapter.verifyCallback(callback.body, null), /authentication failed/);
    const modifiedBody = callback.body.replace('7500', '7501');
    await assert.rejects(restartedAdapter.verifyCallback(modifiedBody, callback.signature), /authentication failed/);
  });
}

test('simulator classifies non-success responses without settling', async () => {
  const provider = getSimulatedProvider('mtn_mobile_money');
  const contexts: SimulationScenario[] = ['pending', 'delayed'];
  for (const scenario of contexts) {
    const initiated = await provider.initiatePayment(input(scenario, scenario));
    assert.equal(initiated.accepted, true);
    assert.equal(initiated.status, 'pending');
  }
  for (const scenario of ['insufficient_funds', 'invalid_payer', 'rejected', 'expired'] as const) {
    const initiated = await provider.initiatePayment(input(scenario, scenario));
    assert.equal(initiated.accepted, false);
  }
  await assert.rejects(provider.initiatePayment(input('timeout', 'timeout')), /SIMULATED_TIMEOUT/);
  await assert.rejects(provider.initiatePayment(input('unavailable', 'unavailable')), /SIMULATED_PROVIDER_UNAVAILABLE/);
});
