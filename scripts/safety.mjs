/** Shared guards for one-off database scripts. */

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function disposableDatabaseUrl() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Disposable-database scripts are disabled when NODE_ENV=production.');
  }
  if (process.env.TAXFLOW_DATABASE_TARGET !== 'disposable') {
    throw new Error('Set TAXFLOW_DATABASE_TARGET=disposable before running this script.');
  }
  const value = requiredEnv('DATABASE_URL');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (!localHost && process.env.TAXFLOW_ALLOW_REMOTE_DISPOSABLE !== 'true') {
    throw new Error('Remote disposable databases require TAXFLOW_ALLOW_REMOTE_DISPOSABLE=true.');
  }
  return value;
}

export function requireMutationConfirmation(variable, expected) {
  if (process.env[variable] !== expected) {
    throw new Error(`Set ${variable}=${expected} to authorize this mutation.`);
  }
}
