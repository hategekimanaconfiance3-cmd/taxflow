import * as schema from './schema';

import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
// SQL query parameters can contain session tokens and other private data.
// Keep query logging in development only; Vercel production logs are shared
// operational data and must not receive bound parameter values.
export const db = drizzle(pool, {
  schema,
  logger: process.env.NODE_ENV !== 'production',
});
export default db;
