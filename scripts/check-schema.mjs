import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_6XgNdhp1bHjP@ep-still-rain-b4rhpmff-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
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
