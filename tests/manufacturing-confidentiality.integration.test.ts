import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const isDisposableTestDatabase = Boolean(
  testDatabaseUrl
  && process.env.B2B_TEST_DATABASE_DISPOSABLE === '1'
  && /test|ci|disposable/i.test(new URL(testDatabaseUrl).pathname),
);

test('confidential manufacturing migration is repeatable and preserves private recipe records', {
  skip: !isDisposableTestDatabase ? 'Requires TEST_DATABASE_URL and explicit disposable database opt-in.' : false,
}, async () => {
  const [{ default: postgres }, { drizzle }, schema, { eq }] = await Promise.all([
    import('postgres'),
    import('drizzle-orm/postgres-js'),
    import('../db/schema'),
    import('drizzle-orm'),
  ]);
  const client = postgres(testDatabaseUrl!);
  const db = drizzle(client, { schema });
  const manufacturerId = randomUUID();
  const otherManufacturerId = randomUUID();
  const productId = randomUUID();
  const otherProductId = randomUUID();
  const materialId = randomUUID();
  const otherMaterialId = randomUUID();
  const recipeId = randomUUID();
  const recipeMaterialId = randomUUID();
  const batchId = randomUUID();
  const batchMaterialId = randomUUID();
  const auditId = randomUUID();
  const batchReference = `TEST-${randomUUID()}`;
  let migrationApplied = false;

  try {
    const migration = await readFile('db/migrations/taxflow/0021_confidential_manufacturing_recipes.sql', 'utf8');
    await client.unsafe(migration);
    migrationApplied = true;
    await client.unsafe(migration);
    const ownershipMigration = await readFile('db/migrations/taxflow/0022_manufacturing_ownership_guards.sql', 'utf8');
    await client.unsafe(ownershipMigration);
    await client.unsafe(ownershipMigration);

    await db.insert(schema.user).values({ id: manufacturerId, name: 'Manufacturing integration test', email: `${manufacturerId}@test.invalid`, role: 'manufacturer' });
    await db.insert(schema.user).values({ id: otherManufacturerId, name: 'Other manufacturer integration test', email: `${otherManufacturerId}@test.invalid`, role: 'manufacturer' });
    await db.insert(schema.product).values({ id: productId, name: 'Test product', unit: 'kg', createdByUserId: manufacturerId });
    await db.insert(schema.product).values({ id: otherProductId, name: 'Other test product', unit: 'kg', createdByUserId: otherManufacturerId });
    await db.insert(schema.manufacturingMaterial).values({ id: materialId, manufacturerId, materialCode: 'M-001', confidentialName: 'test confidential ingredient', unit: 'kg' });
    await db.insert(schema.manufacturingMaterial).values({ id: otherMaterialId, manufacturerId: otherManufacturerId, materialCode: 'M-001', confidentialName: 'other confidential ingredient', unit: 'kg' });
    await db.insert(schema.manufacturingRecipe).values({ id: recipeId, manufacturerId, productId, version: 1, batchOutputQuantity: 100, materialTolerancePercent: 5 });
    await db.insert(schema.manufacturingRecipeMaterial).values({ id: recipeMaterialId, recipeId, materialId, plannedQuantity: 12 });
    await db.insert(schema.productionBatch).values({
      id: batchId, manufacturerId, productId, batchReference,
      declaredQuantity: 100, plannedQuantity: 100,
      periodStart: new Date(), periodEnd: new Date(),
    });
    await db.insert(schema.productionBatchMaterial).values({
      id: batchMaterialId, batchId, recipeId, recipeMaterialId, materialId,
      plannedQuantity: 12, actualQuantity: 13,
    });
    await db.insert(schema.auditLog).values({
      id: auditId, userId: manufacturerId, action: 'MANUFACTURING_RECIPE_VERSION_CREATED',
      targetType: 'manufacturing_recipe', targetId: recipeId, metadata: JSON.stringify({ version: 1, materialCount: 1 }),
    });

    const [storedMaterial] = await db.select({ code: schema.manufacturingMaterial.materialCode, actual: schema.productionBatchMaterial.actualQuantity })
      .from(schema.productionBatchMaterial)
      .innerJoin(schema.manufacturingMaterial, eq(schema.productionBatchMaterial.materialId, schema.manufacturingMaterial.id))
      .where(eq(schema.productionBatchMaterial.batchId, batchId));
    assert.deepEqual(storedMaterial, { code: 'M-001', actual: 13 });

    await assert.rejects(
      db.insert(schema.manufacturingRecipe).values({ id: randomUUID(), manufacturerId, productId: otherProductId, version: 1, batchOutputQuantity: 100 }),
      /recipe product must belong/i,
    );
    await assert.rejects(
      db.insert(schema.manufacturingRecipeMaterial).values({ id: randomUUID(), recipeId, materialId: otherMaterialId, plannedQuantity: 12 }),
      /recipe materials must belong/i,
    );
    await assert.rejects(
      db.insert(schema.productionBatchMaterial).values({ id: randomUUID(), batchId, recipeId, recipeMaterialId, materialId: otherMaterialId, plannedQuantity: 12, actualQuantity: 12 }),
      /production material evidence must match/i,
    );

    await assert.rejects(
      client.unsafe('UPDATE public.manufacturing_material SET confidential_name = $1 WHERE id = $2', ['rewritten name', materialId]),
      /immutable/i,
    );
    await assert.rejects(
      client.unsafe('UPDATE public.manufacturing_recipe_material SET planned_quantity = 90 WHERE id = $1', [recipeMaterialId]),
      /immutable/i,
    );
    const [audit] = await db.select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.id, auditId));
    assert.equal(audit?.action, 'MANUFACTURING_RECIPE_VERSION_CREATED');
  } finally {
    if (migrationApplied) {
      await client.unsafe('ALTER TABLE public.audit_log DISABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.production_batch_material DISABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.manufacturing_recipe_material DISABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.manufacturing_recipe DISABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.manufacturing_material DISABLE TRIGGER USER');
      await db.delete(schema.auditLog).where(eq(schema.auditLog.id, auditId));
      await db.delete(schema.productionBatchMaterial).where(eq(schema.productionBatchMaterial.id, batchMaterialId));
      await db.delete(schema.productionBatch).where(eq(schema.productionBatch.id, batchId));
      await db.delete(schema.manufacturingRecipeMaterial).where(eq(schema.manufacturingRecipeMaterial.id, recipeMaterialId));
      await db.delete(schema.manufacturingRecipe).where(eq(schema.manufacturingRecipe.id, recipeId));
      await db.delete(schema.manufacturingMaterial).where(eq(schema.manufacturingMaterial.id, materialId));
      await db.delete(schema.product).where(eq(schema.product.id, productId));
      await db.delete(schema.user).where(eq(schema.user.id, manufacturerId));
      await db.delete(schema.manufacturingMaterial).where(eq(schema.manufacturingMaterial.id, otherMaterialId));
      await db.delete(schema.product).where(eq(schema.product.id, otherProductId));
      await db.delete(schema.user).where(eq(schema.user.id, otherManufacturerId));
      await client.unsafe('ALTER TABLE public.manufacturing_material ENABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.manufacturing_recipe ENABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.manufacturing_recipe_material ENABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.production_batch_material ENABLE TRIGGER USER');
      await client.unsafe('ALTER TABLE public.audit_log ENABLE TRIGGER USER');
    }
    await client.end();
  }
});
