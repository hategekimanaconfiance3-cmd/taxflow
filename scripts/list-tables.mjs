import pg from 'pg';
import 'dotenv/config';
import { requiredEnv } from './safety.mjs';
const { Client } = pg;
const client = new Client({
  connectionString: requiredEnv('DATABASE_URL')
});
await client.connect();
const { rows } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
);
console.log('Tables:', rows.map(r => r.table_name).join(', '));
await client.end();
