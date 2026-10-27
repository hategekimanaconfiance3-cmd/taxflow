import 'dotenv/config';
import seedTaxFlowNeonDB from './taxflow-neon.seed';
import seedTinNeonDB from './tin-neon.seed';

async function seedAllNeonDBs() {
  console.log('Starting to seed all Neon databases...\n');

  try {
    // Seed TaxFlow Neon DB
    console.log('=== SEEDING TAXFLOW NEON DB ===');
    await seedTaxFlowNeonDB();
    console.log('✅ TaxFlow Neon DB seeding completed\n');

    // Seed TIN Neon DB
    console.log('=== SEEDING TIN NEON DB ===');
    await seedTinNeonDB();
    console.log('✅ TIN Neon DB seeding completed\n');

    console.log('🎉 All Neon databases seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding Neon databases:', error);
    throw error;
  }
}

// Run the seed
if (require.main === module) {
  seedAllNeonDBs()
    .then(() => {
      console.log('All Neon databases seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('All Neon databases seeding failed:', error);
      process.exit(1);
    });
}

export default seedAllNeonDBs;
