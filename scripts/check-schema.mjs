import pg from 'pg';
import 'dotenv/config';
import { requiredEnv } from './safety.mjs';
const { Client } = pg;
const client = new Client({
  connectionString: requiredEnv('DATABASE_URL')
});
await client.connect();

const { rows } = await client.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'account' ORDER BY ordinal_position"
);
console.log('account columns:', rows.map(r => r.column_name));

const { rows: ur } = await client.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'user' ORDER BY ordinal_position"
);
console.log('user columns:', ur.map(r => r.column_name));

// Sample account row
const { rows: sample } = await client.query('SELECT * FROM account LIMIT 2');
console.log('sample account row keys:', sample.length ? Object.keys(sample[0]) : 'none');

await client.end();
