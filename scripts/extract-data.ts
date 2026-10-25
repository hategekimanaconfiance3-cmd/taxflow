import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { user, account, rraStaff } from '../db/schema';
import * as schema from '../db/schema';

// Initialize database connection
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Function to extract data
async function extractData() {
  try {
    console.log('Extracting data from TaxFlow database...\n');

    // Extract user data
    console.log('Extracting user data...');
    const users = await db.select().from(user);
    console.log(`Found ${users.length} users`);

    // Extract account data
    console.log('Extracting account data...');
    const accounts = await db.select().from(account);
    console.log(`Found ${accounts.length} accounts`);

    // Extract RRA staff data
    console.log('Extracting RRA staff data...');
    const rraStaffData = await db.select().from(rraStaff);
    console.log(`Found ${rraStaffData.length} RRA staff members\n`);

    // Create combined data structure
    const extractedData = {
      users,
      accounts,
      rraStaff: rraStaffData,
      extractionTimestamp: new Date().toISOString(),
    };

    // Save to file
    const outputPath = path.join(__dirname, '..', 'data', 'extracted-data.json');

    // Ensure the data directory exists
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(extractedData, null, 2));
    console.log(`Data extracted and saved to: ${outputPath}`);

    // Display sample data
    console.log('\n--- Sample User Data ---');
    if (users.length > 0) {
      console.log(JSON.stringify(users[0], null, 2));
    }

    console.log('\n--- Sample Account Data ---');
    if (accounts.length > 0) {
      console.log(JSON.stringify(accounts[0], null, 2));
    }

    console.log('\n--- Sample RRA Staff Data ---');
    if (rraStaffData.length > 0) {
      console.log(JSON.stringify(rraStaffData[0], null, 2));
    }

    return extractedData;
  } catch (error) {
    console.error('Error extracting data:', error);
    throw error;
  }
}

// Run the extraction
if (require.main === module) {
  extractData()
    .then(() => {
      console.log('\nData extraction completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nData extraction failed:', error);
      process.exit(1);
    });
}

export default extractData;
