import 'dotenv/config';
// import postgres from 'postgres';
// import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// const client = postgres(process.env.DATABASE_URL!);
// export const db = drizzle(client, { schema, logger: true });
// export default db;

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema, logger: true });
export default db;
