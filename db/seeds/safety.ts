import 'dotenv/config';

type SeedTarget = 'disposable' | 'nonproduction';

/**
 * Require an explicit, non-production target before a seed can connect.
 * Local seeds are restricted to loopback unless a remote disposable database
 * is explicitly allowed. Remote non-production seeds require a second, human-
 * readable confirmation because they may delete or overwrite demo records.
 */
export function requireSeedDatabase(variable: 'DATABASE_URL' | 'TIN_DATABASE_URL', target: SeedTarget): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed scripts are disabled when NODE_ENV=production.');
  }
  if (process.env.TAXFLOW_DATABASE_TARGET !== target) {
    throw new Error(`Set TAXFLOW_DATABASE_TARGET=${target} before running this seed.`);
  }
  if (target === 'nonproduction' && process.env.TAXFLOW_CONFIRM_SEED !== 'SEED_NONPRODUCTION_DATABASE') {
    throw new Error('Set TAXFLOW_CONFIRM_SEED=SEED_NONPRODUCTION_DATABASE before seeding a remote non-production database.');
  }

  const value = process.env[variable]?.trim();
  if (!value) throw new Error(`${variable} is required.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variable} must be a valid PostgreSQL URL.`);
  }

  const localHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (target === 'disposable' && !localHost && process.env.TAXFLOW_ALLOW_REMOTE_DISPOSABLE !== 'true') {
    throw new Error('Remote disposable databases require TAXFLOW_ALLOW_REMOTE_DISPOSABLE=true.');
  }
  return value;
}
