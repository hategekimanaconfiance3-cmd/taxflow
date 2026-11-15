import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../schema';
import { user, account, rraStaff } from '../../schema';
import fs from 'fs';
import path from 'path';

// Import the extracted data
const extractedDataPath = path.join(__dirname, '..', '..', '..', 'data', 'extracted-data.json');
const extractedDataRaw = fs.readFileSync(extractedDataPath, 'utf8');
const extractedData = JSON.parse(extractedDataRaw) as {
  users: Array<typeof user.$inferInsert>;
  accounts: Array<typeof account.$inferInsert>;
  rraStaff: Array<typeof rraStaff.$inferInsert>;
};

// Helper function to convert string timestamps to Date objects
function convertTimestamps<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string' && obj.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/)) {
    return new Date(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertTimestamps) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertTimestamps(value);
    }
    return result as T;
  }

  return obj;
}

// Convert all timestamp strings to Date objects
const users = convertTimestamps(extractedData.users);
const accounts = convertTimestamps(extractedData.accounts);
const rraStaffMembers = convertTimestamps(extractedData.rraStaff);

async function seedTaxFlowNeonDB() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error('This seed script deletes existing rows. Set ALLOW_DESTRUCTIVE_SEED=true in a non-production environment to proceed.');
  }
  console.log('Starting to seed TaxFlow Neon DB...');

  // Connection to Neon DB
  const connectionString = process.env.DATABASE_URL!;
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  try {
    // Clean existing data (in reverse order of foreign key dependencies)
    console.log('Cleaning existing data...');
    await db.delete(rraStaff);
    await db.delete(account);
    await db.delete(user);

    // Seed users
    console.log(`Seeding ${users.length} users...`);
    for (const userData of users) {
      await db.insert(user).values({
        id: userData.id,
        name: userData.name,
        username: userData.username,
        displayUsername: userData.displayUsername,
        nationalId: userData.nationalId,
        tinNumber: userData.tinNumber,
        businessName: userData.businessName,
        phoneNumber: userData.phoneNumber,
        phoneNumberVerified: userData.phoneNumberVerified,
        role: userData.role,
        clearanceStatus: userData.clearanceStatus,
        email: userData.email,
        emailVerified: userData.emailVerified,
        image: userData.image,
        isActive: userData.isActive,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      });
    }

    // Seed accounts
    console.log(`Seeding ${accounts.length} accounts...`);
    for (const accountData of accounts) {
      await db.insert(account).values({
        id: accountData.id,
        accountId: accountData.accountId,
        providerId: accountData.providerId,
        userId: accountData.userId,
        accessToken: accountData.accessToken,
        refreshToken: accountData.refreshToken,
        idToken: accountData.idToken,
        accessTokenExpiresAt: accountData.accessTokenExpiresAt,
        refreshTokenExpiresAt: accountData.refreshTokenExpiresAt,
        scope: accountData.scope,
        password: accountData.password,
        createdAt: accountData.createdAt,
        updatedAt: accountData.updatedAt,
      });
    }

    // Seed RRA staff
    console.log(`Seeding ${rraStaffMembers.length} RRA staff members...`);
    for (const rraStaffData of rraStaffMembers) {
      await db.insert(rraStaff).values({
        id: rraStaffData.id,
        userId: rraStaffData.userId,
        staffId: rraStaffData.staffId,
        department: rraStaffData.department,
        clearanceLevel: rraStaffData.clearanceLevel,
        assignedBy: rraStaffData.assignedBy,
        isActive: rraStaffData.isActive,
        createdAt: rraStaffData.createdAt,
        updatedAt: rraStaffData.updatedAt,
      });
    }

    console.log('TaxFlow Neon DB seeded successfully!');
  } catch (error) {
    console.error('Error seeding TaxFlow Neon DB:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the seed
if (require.main === module) {
  seedTaxFlowNeonDB()
    .then(() => {
      console.log('TaxFlow Neon DB seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('TaxFlow Neon DB seeding failed:', error);
      process.exit(1);
    });
}

export default seedTaxFlowNeonDB;
