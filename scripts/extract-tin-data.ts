import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { citizen, tinRecord } from '../db/tin-schema';
import * as schema from '../db/tin-schema';

// Initialize database connection
const connectionString = process.env.TIN_DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Function to extract data
async function extractTinData() {
  try {
    console.log('Extracting data from TIN database...\n');

    // Extract citizen data
    console.log('Extracting citizen data...');
    const citizens = await db.select().from(citizen);
    console.log(`Found ${citizens.length} citizens`);

    // Extract TIN record data
    console.log('Extracting TIN record data...');
    const tinRecords = await db.select().from(tinRecord);
    console.log(`Found ${tinRecords.length} TIN records\n`);

    // Create combined data structure
    const extractedData = {
      citizens,
      tinRecords,
      extractionTimestamp: new Date().toISOString()
    };

    // Save to file
    const outputPath = path.join(__dirname, '..', 'data', 'tin-extracted-data.json');

    // Ensure the data directory exists
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(extractedData, null, 2));
    console.log(`Data extracted and saved to: ${outputPath}`);

    // Display sample data
    console.log('\n--- Sample Citizen Data ---');
    if (citizens.length > 0) {
      console.log(JSON.stringify(citizens[0], null, 2));
    }

    console.log('\n--- Sample TIN Record Data ---');
    if (tinRecords.length > 0) {
      console.log(JSON.stringify(tinRecords[0], null, 2));
    }

    return extractedData;
  } catch (error) {
    console.error('Error extracting data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the extraction
if (require.main === module) {
  extractTinData()
    .then(() => {
      console.log('\nTIN data extraction completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nTIN data extraction failed:', error);
      process.exit(1);
    });
}

export default extractTinData;
