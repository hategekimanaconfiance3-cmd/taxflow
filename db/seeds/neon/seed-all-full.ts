import 'dotenv/config';
import seedTinFullDB from './tin-full.seed';
import seedTaxFlowFull from './taxflow-full.seed';

async function seedAllFull(): Promise<void> {
  console.log('🚀 Starting full comprehensive seed for all Neon databases...\n');

  try {
    console.log('════════════════════════════════════════════');
    console.log('  STEP 1: TIN REGISTRY DB (all 30 districts)');
    console.log('════════════════════════════════════════════');
    await seedTinFullDB();
    console.log('✅ TIN DB done\n');

    console.log('════════════════════════════════════════════');
    console.log('  STEP 2: TAXFLOW DB (staff + 58 traders)   ');
    console.log('════════════════════════════════════════════');
    await seedTaxFlowFull();
    console.log('✅ TaxFlow DB done\n');

    console.log('🎉 All databases seeded successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

if (require.main === module) {
  seedAllFull()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default seedAllFull;
