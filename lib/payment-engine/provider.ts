import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ProviderCallback, ProviderInitiation } from './domain';

export type SimulatedProviderName = 'mtn_mobile_money' | 'airtel_money' | 'bank_gateway';
export type SimulationScenario = 'success' | 'pending' | 'rejected' | 'insufficient_funds' | 'invalid_payer' | 'timeout' | 'unavailable' | 'delayed' | 'expired';
export type ProviderStatus = 'pending' | 'success' | 'failed' | 'expired';

export interface SimulatorConfig {
  provider: SimulatedProviderName;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  apiKey: string;
  callbackSecret: string;
  scenario: SimulationScenario;
}

export interface SimulatorInitiation extends ProviderInitiation {
  taxpayerReference: string;
  obligationId: string;
  scenario?: SimulationScenario;
}

export interface SimulatorInitiationResult {
  accepted: boolean;
  providerReference: string;
  status: ProviderStatus;
  responseCode: string;
  message: string;
  authorizationRequired: boolean;
  simulated: true;
  scenario: SimulationScenario;
}

export interface SimulatorTransactionContext {
  paymentReference: string;
  providerReference: string;
  taxpayerReference: string;
  obligationId: string;
  amount: number;
  currency: string;
}

export interface SimulatedProviderAdapter {
  readonly provider: SimulatedProviderName;
  authenticate(): Promise<{ token: string; expiresInSeconds: number; simulated: true }>;
  initiatePayment(input: SimulatorInitiation): Promise<SimulatorInitiationResult>;
  authorize(context: SimulatorTransactionContext, scenario?: SimulationScenario): Promise<SimulatorInitiationResult>;
  inquireStatus(context: SimulatorTransactionContext, scenario: SimulationScenario): Promise<{ status: ProviderStatus; responseCode: string; simulated: true }>;
  verifyCallback(rawBody: string, signature: string | null): Promise<ProviderCallback & { eventId: string; taxpayerReference: string; obligationId: string }>;
  signCallback(rawBody: string): string;
  makeCallback(context: SimulatorTransactionContext, outcome?: ProviderStatus): Promise<{ body: string; signature: string }>;
}

const scenarioStatus: Record<SimulationScenario, { status: ProviderStatus; code: string; message: string }> = {
  success: { status: 'success', code: 'SIM-00', message: 'Simulated payment authorized.' },
  pending: { status: 'pending', code: 'SIM-01', message: 'Simulated authorization is pending.' },
  rejected: { status: 'failed', code: 'SIM-05', message: 'Simulated authorization rejected.' },
  insufficient_funds: { status: 'failed', code: 'SIM-51', message: 'Simulated insufficient funds.' },
  invalid_payer: { status: 'failed', code: 'SIM-14', message: 'Simulated payer was not recognized.' },
  timeout: { status: 'pending', code: 'SIM-TIMEOUT', message: 'Simulated provider request timed out; retry inquiry.' },
  unavailable: { status: 'pending', code: 'SIM-UNAVAILABLE', message: 'Simulated provider is temporarily unavailable.' },
  delayed: { status: 'pending', code: 'SIM-DELAYED', message: 'Simulated confirmation is delayed.' },
  expired: { status: 'expired', code: 'SIM-EXPIRED', message: 'Simulated authorization expired.' },
};

/** Stateless provider API simulator. Durable transaction context is supplied by TaxFlow storage. */
class ProviderSimulator implements SimulatedProviderAdapter {
  constructor(readonly provider: SimulatedProviderName, private readonly config: SimulatorConfig) {}

  async authenticate(): Promise<{ token: string; expiresInSeconds: number; simulated: true }> {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.apiKey) throw new Error('Simulator credentials are not configured.');
    const token = createHmac('sha256', this.config.clientSecret).update(`${this.config.clientId}:${Date.now()}`).digest('hex');
    return { token: `sim_${token}`, expiresInSeconds: 300, simulated: true };
  }

  async initiatePayment(input: SimulatorInitiation): Promise<SimulatorInitiationResult> {
    await this.authenticate();
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.currency !== 'RWF' || !input.taxpayerReference || !input.obligationId) {
      throw new Error('Simulator payment request is invalid.');
    }
    const providerReference = `${this.provider.toUpperCase()}-${randomUUID()}`;
    const scenario = input.scenario ?? this.config.scenario;
    if (scenario === 'timeout') throw new Error('SIMULATED_TIMEOUT');
    if (scenario === 'unavailable') throw new Error('SIMULATED_PROVIDER_UNAVAILABLE');
    if (scenario === 'rejected' || scenario === 'insufficient_funds' || scenario === 'invalid_payer' || scenario === 'expired') {
      const result = scenarioStatus[scenario];
      return { accepted: false, providerReference, status: result.status, responseCode: result.code, message: result.message, authorizationRequired: false, simulated: true, scenario };
    }
    const response = scenarioStatus[scenario];
    return { accepted: true, providerReference, status: response.status, responseCode: response.code, message: response.message, authorizationRequired: true, simulated: true, scenario };
  }

  async authorize(context: SimulatorTransactionContext, scenario: SimulationScenario = this.config.scenario): Promise<SimulatorInitiationResult> {
    if (!context.providerReference.startsWith(`${this.provider.toUpperCase()}-`)) throw new Error('SIMULATED_UNKNOWN_TRANSACTION');
    const chosen = scenario;
    const response = scenarioStatus[chosen];
    return { accepted: response.status !== 'failed' && response.status !== 'expired', providerReference: context.providerReference, status: response.status, responseCode: response.code, message: response.message, authorizationRequired: false, simulated: true, scenario };
  }

  async inquireStatus(context: SimulatorTransactionContext, scenario: SimulationScenario): Promise<{ status: ProviderStatus; responseCode: string; simulated: true }> {
    if (!context.providerReference.startsWith(`${this.provider.toUpperCase()}-`)) throw new Error('SIMULATED_UNKNOWN_TRANSACTION');
    if (scenario === 'timeout') throw new Error('SIMULATED_TIMEOUT');
    if (scenario === 'unavailable') throw new Error('SIMULATED_PROVIDER_UNAVAILABLE');
    const response = scenarioStatus[scenario];
    return { status: response.status, responseCode: response.code, simulated: true };
  }

  signCallback(rawBody: string): string {
    return createHmac('sha256', this.config.callbackSecret).update(rawBody).digest('hex');
  }

  async verifyCallback(rawBody: string, signature: string | null): Promise<ProviderCallback & { eventId: string; taxpayerReference: string; obligationId: string }> {
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) throw new Error('Provider callback authentication failed.');
    const expected = Buffer.from(this.signCallback(rawBody), 'hex');
    const supplied = Buffer.from(signature, 'hex');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error('Provider callback authentication failed.');
    const data: unknown = JSON.parse(rawBody);
    if (!data || typeof data !== 'object') throw new Error('Provider callback payload is invalid.');
    const row = data as Record<string, unknown>;
    if (typeof row.eventId !== 'string' || typeof row.paymentReference !== 'string' || typeof row.providerReference !== 'string' ||
      typeof row.taxpayerReference !== 'string' || typeof row.obligationId !== 'string' || !Number.isSafeInteger(row.amount) ||
      typeof row.currency !== 'string' || !['success', 'failed', 'pending', 'expired'].includes(String(row.outcome))) {
      throw new Error('Provider callback payload is invalid.');
    }
    return row as unknown as ProviderCallback & { eventId: string; taxpayerReference: string; obligationId: string };
  }

  async makeCallback(context: SimulatorTransactionContext, outcome: ProviderStatus = 'success'): Promise<{ body: string; signature: string }> {
    if (!context.providerReference.startsWith(`${this.provider.toUpperCase()}-`)) throw new Error('SIMULATED_UNKNOWN_TRANSACTION');
    const body = JSON.stringify({
      eventId: randomUUID(), paymentReference: context.paymentReference, providerReference: context.providerReference,
      taxpayerReference: context.taxpayerReference, obligationId: context.obligationId,
      amount: context.amount, currency: context.currency, outcome,
    });
    return { body, signature: this.signCallback(body) };
  }
}

function loadSimulatorConfig(provider: SimulatedProviderName): SimulatorConfig {
  if (process.env.NODE_ENV === 'production' || process.env.PAYMENT_PROVIDER_MODE !== 'simulation') {
    throw new Error('Simulated providers are disabled outside explicit non-production simulation mode.');
  }
  const prefix = provider === 'mtn_mobile_money' ? 'MTN_SIM' : provider === 'airtel_money' ? 'AIRTEL_SIM' : 'BANK_SIM';
  const required = (name: string): string => {
    const value = process.env[`${prefix}_${name}`];
    if (!value) throw new Error(`Missing development-only simulator setting ${prefix}_${name}.`);
    return value;
  };
  const scenario = process.env[`${prefix}_SCENARIO`] ?? 'pending';
  if (!(scenario in scenarioStatus)) throw new Error(`Invalid simulator scenario for ${provider}.`);
  return {
    provider,
    baseUrl: required('BASE_URL'),
    clientId: required('CLIENT_ID'),
    clientSecret: required('CLIENT_SECRET'),
    apiKey: required('API_KEY'),
    callbackSecret: required('CALLBACK_SECRET'),
    scenario: scenario as SimulationScenario,
  };
}

export function getSimulatedProvider(provider: SimulatedProviderName): ProviderSimulator {
  return new ProviderSimulator(provider, loadSimulatorConfig(provider));
}

export function getSandboxProvider(): ProviderSimulator {
  return getSimulatedProvider('mtn_mobile_money');
}
