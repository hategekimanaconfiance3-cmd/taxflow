import 'server-only';

import { desc, eq } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, importIntent } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import type { ImportIntentInput } from '@/lib/validation/import-intent.schema';

export async function listImportIntents(businessId: string) {
  return db.select({
    id: importIntent.id,
    productName: importIntent.productName,
    plannedQuantity: importIntent.plannedQuantity,
    purchaseCountry: importIntent.purchaseCountry,
    createdAt: importIntent.createdAt,
  }).from(importIntent)
    .where(eq(importIntent.businessId, businessId))
    .orderBy(desc(importIntent.createdAt))
    .limit(100);
}

export async function createImportIntent(businessId: string, input: ImportIntentInput) {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(importIntent).values({
      businessId,
      productName: input.productName,
      plannedQuantity: input.plannedQuantity,
      purchaseCountry: input.purchaseCountry,
    }).returning({
      id: importIntent.id,
      productName: importIntent.productName,
      plannedQuantity: importIntent.plannedQuantity,
      purchaseCountry: importIntent.purchaseCountry,
      createdAt: importIntent.createdAt,
    });
    if (!created) throw new Error('Import intent was not saved.');

    await logAudit({
      userId: businessId,
      action: 'IMPORT_INTENT_RECORDED',
      targetType: 'import_intent',
      targetId: created.id,
      metadata: {
        productName: created.productName,
        plannedQuantity: created.plannedQuantity,
        purchaseCountry: created.purchaseCountry,
        purpose: 'resale',
      },
    }, async (entry) => { await tx.insert(auditLog).values(entry); });

    return created;
  });
}
