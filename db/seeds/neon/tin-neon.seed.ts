import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../tin-schema';
import { citizen, tinRecord } from '../../tin-schema';
import fs from 'fs';
import path from 'path';

// Import the extracted data
const extractedDataPath = path.join(__dirname, '..', '..', '..', 'data', 'tin-extracted-data.json');
const extractedDataRaw = fs.readFileSync(extractedDataPath, 'utf8');
const extractedData = JSON.parse(extractedDataRaw);

// Helper function to convert string timestamps to Date objects
function convertTimestamps<T>(obj: T): T {
  const convert = (value: unknown): unknown => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
      return new Date(value);
    }
    if (Array.isArray(value)) return value.map(convert);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, convert(nested)]));
    }
    return value;
  };
  return convert(obj) as T;
}

// Convert all timestamp strings to Date objects
const citizens = convertTimestamps(extractedData.citizens);
const tinRecords = convertTimestamps(extractedData.tinRecords);

async function seedTinNeonDB() {
  console.log('Starting to seed TIN Neon DB...');

  // Connection to Neon DB
  const connectionString = process.env.TIN_DATABASE_URL!;
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  try {
    // Clean existing data (in reverse order of foreign key dependencies)
    console.log('Cleaning existing data...');
    await db.delete(tinRecord);
    await db.delete(citizen);

    // Seed citizens
    console.log(`Seeding ${citizens.length} citizens...`);
    for (const citizenData of citizens) {
      await db.insert(citizen).values({
        id: citizenData.id,
        nationalId: citizenData.nationalId,
        firstName: citizenData.firstName,
        lastName: citizenData.lastName,
        dateOfBirth: citizenData.dateOfBirth,
        gender: citizenData.gender,
        province: citizenData.province,
        district: citizenData.district,
        sector: citizenData.sector,
        cell: citizenData.cell,
        village: citizenData.village,
        createdAt: citizenData.createdAt,
      });
    }

    // Seed TIN records
    console.log(`Seeding ${tinRecords.length} TIN records...`);
    for (const tinRecordData of tinRecords) {
      await db.insert(tinRecord).values({
        id: tinRecordData.id,
        tinNumber: tinRecordData.tinNumber,
        nationalId: tinRecordData.nationalId,
        businessName: tinRecordData.businessName,
        businessType: tinRecordData.businessType,
        phone: tinRecordData.phone,
        email: tinRecordData.email,
        address: tinRecordData.address,
        province: tinRecordData.province,
        district: tinRecordData.district,
        sector: tinRecordData.sector,
        cell: tinRecordData.cell,
        village: tinRecordData.village,
        isActive: tinRecordData.isActive,
        registeredAt: tinRecordData.registeredAt,
      });
    }

    console.log('TIN Neon DB seeded successfully!');
  } catch (error) {
    console.error('Error seeding TIN Neon DB:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the seed
if (require.main === module) {
  seedTinNeonDB()
    .then(() => {
      console.log('TIN Neon DB seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('TIN Neon DB seeding failed:', error);
      process.exit(1);
    });
}

export default seedTinNeonDB;
