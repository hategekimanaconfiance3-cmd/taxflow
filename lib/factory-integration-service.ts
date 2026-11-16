import 'server-only';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, factory, factoryProductionLine, factoryProductionStage } from '@/db/schema';
import type {
  FactoryRegistrationInput,
  FactoryReviewInput,
  ProductionLineRegistrationInput,
} from '@/lib/validation/manufacturing-integration.schema';

export const BEVERAGE_PRODUCTION_STAGES = [
  { stageCode: 'RAW_MATERIAL_PREPARATION', name: 'Raw material preparation', sequenceNumber: 1 },
  { stageCode: 'WATER_TREATMENT', name: 'Water treatment', sequenceNumber: 2 },
  { stageCode: 'MIXING_FORMULATION', name: 'Mixing and formulation', sequenceNumber: 3 },
  { stageCode: 'FILLING', name: 'Filling', sequenceNumber: 4 },
  { stageCode: 'CAPPING_SEALING', name: 'Capping and sealing', sequenceNumber: 5 },
  { stageCode: 'LABELING', name: 'Labeling', sequenceNumber: 6 },
  { stageCode: 'PACKAGING', name: 'Packaging', sequenceNumber: 7 },
  { stageCode: 'QUALITY_INSPECTION', name: 'Quality inspection', sequenceNumber: 8 },
  { stageCode: 'FINISHED_GOODS_STORAGE', name: 'Finished-goods storage', sequenceNumber: 9 },
  { stageCode: 'DISPATCH', name: 'Dispatch', sequenceNumber: 10 },
] as const;

export type FactorySummary = typeof factory.$inferSelect & { lineCount: number };

function reviewStatusUpdate(decision: FactoryReviewInput['decision']): {
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  approvedAt?: Date | null;
} {
  if (decision === 'approved' || decision === 'active') {
    return { verificationStatus: 'verified', approvedAt: new Date() };
  }
  if (decision === 'rejected') return { verificationStatus: 'rejected', approvedAt: null };
  if (decision === 'under_review' || decision === 'technical_assessment') return { verificationStatus: 'pending' };
  return {};
}

function assertReviewTransition(current: string, next: FactoryReviewInput['decision']): void {
  const transitions: Record<string, readonly FactoryReviewInput['decision'][]> = {
    submitted: ['under_review', 'rejected'],
    under_review: ['technical_assessment', 'rejected'],
    technical_assessment: ['integration_pending', 'rejected'],
    integration_pending: ['integration_testing', 'rejected'],
    integration_testing: ['approved', 'rejected'],
    approved: ['active', 'suspended'],
    active: ['suspended'],
    suspended: ['active', 'rejected'],
  };
  if (!transitions[current]?.includes(next)) {
    throw new Error(`Factory cannot transition from ${current} to ${next}.`);
  }
}

export async function listManufacturerFactories(manufacturerId: string): Promise<FactorySummary[]> {
  const rows = await db
    .select({
      id: factory.id,
      manufacturerId: factory.manufacturerId,
      factoryCode: factory.factoryCode,
      name: factory.name,
      address: factory.address,
      latitude: factory.latitude,
      longitude: factory.longitude,
      industryType: factory.industryType,
      registrationReference: factory.registrationReference,
      productionCapacity: factory.productionCapacity,
      productionCapacityUnit: factory.productionCapacityUnit,
      onboardingStatus: factory.onboardingStatus,
      integrationStatus: factory.integrationStatus,
      connectivityStatus: factory.connectivityStatus,
      verificationStatus: factory.verificationStatus,
      submittedAt: factory.submittedAt,
      reviewedByUserId: factory.reviewedByUserId,
      reviewedAt: factory.reviewedAt,
      reviewNote: factory.reviewNote,
      approvedAt: factory.approvedAt,
      createdAt: factory.createdAt,
      updatedAt: factory.updatedAt,
      lineCount: sql<number>`COUNT(${factoryProductionLine.id})::int`.as('line_count'),
    })
    .from(factory)
    .leftJoin(factoryProductionLine, eq(factoryProductionLine.factoryId, factory.id))
    .where(eq(factory.manufacturerId, manufacturerId))
    .groupBy(factory.id)
    .orderBy(desc(factory.createdAt));

  return rows.map((row) => ({ ...row, lineCount: Number(row.lineCount ?? 0) }));
}

export async function listFactoryLines(factoryId: string, manufacturerId: string): Promise<Array<typeof factoryProductionLine.$inferSelect & { stages: Array<typeof factoryProductionStage.$inferSelect> }>> {
  const lines = await db
    .select()
    .from(factoryProductionLine)
    .where(and(eq(factoryProductionLine.factoryId, factoryId), eq(factoryProductionLine.manufacturerId, manufacturerId)))
    .orderBy(asc(factoryProductionLine.lineCode));
  if (lines.length === 0) return [];

  const stages = await db
    .select()
    .from(factoryProductionStage)
    .where(inArray(factoryProductionStage.lineId, lines.map((line) => line.id)))
    .orderBy(asc(factoryProductionStage.sequenceNumber));
  const stagesByLine = new Map<string, Array<typeof factoryProductionStage.$inferSelect>>();
  for (const stage of stages) stagesByLine.set(stage.lineId, [...(stagesByLine.get(stage.lineId) ?? []), stage]);

  return lines.map((line) => ({ ...line, stages: stagesByLine.get(line.id) ?? [] }));
}

export async function createFactory(manufacturerId: string, input: FactoryRegistrationInput): Promise<typeof factory.$inferSelect> {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(factory).values({
      manufacturerId,
      factoryCode: input.factoryCode,
      name: input.name,
      address: input.address,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      industryType: input.industryType,
      registrationReference: input.registrationReference || null,
      productionCapacity: input.productionCapacity === null || input.productionCapacity === undefined ? null : String(input.productionCapacity),
      productionCapacityUnit: input.productionCapacityUnit || null,
    }).returning();
    if (!created) throw new Error('Factory registration returned no record.');

    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'FACTORY_REGISTERED',
      targetType: 'factory',
      targetId: created.id,
      afterState: { onboardingStatus: created.onboardingStatus, verificationStatus: created.verificationStatus },
      metadata: JSON.stringify({ factoryCode: created.factoryCode, industryType: created.industryType }),
    });
    return created;
  });
}

export async function submitFactoryForReview(manufacturerId: string, factoryId: string): Promise<typeof factory.$inferSelect> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(factory).where(and(eq(factory.id, factoryId), eq(factory.manufacturerId, manufacturerId))).for('update').limit(1);
    if (!current) throw new Error('Factory not found.');
    if (!['draft', 'rejected'].includes(current.onboardingStatus)) throw new Error(`Factory cannot be submitted from ${current.onboardingStatus}.`);

    const [updated] = await tx.update(factory).set({
      onboardingStatus: 'submitted',
      verificationStatus: 'pending',
      submittedAt: new Date(),
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
    }).where(eq(factory.id, factoryId)).returning();
    if (!updated) throw new Error('Factory submission could not be saved.');

    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'FACTORY_SUBMITTED_FOR_REVIEW',
      targetType: 'factory',
      targetId: factoryId,
      beforeState: { onboardingStatus: current.onboardingStatus },
      afterState: { onboardingStatus: updated.onboardingStatus, verificationStatus: updated.verificationStatus },
    });
    return updated;
  });
}

export async function registerProductionLine(manufacturerId: string, input: ProductionLineRegistrationInput): Promise<typeof factoryProductionLine.$inferSelect> {
  return db.transaction(async (tx) => {
    const [ownedFactory] = await tx.select({ id: factory.id, onboardingStatus: factory.onboardingStatus })
      .from(factory)
      .where(and(eq(factory.id, input.factoryId), eq(factory.manufacturerId, manufacturerId)))
      .for('update')
      .limit(1);
    if (!ownedFactory) throw new Error('Factory not found.');
    if (['suspended', 'rejected'].includes(ownedFactory.onboardingStatus)) throw new Error('Production lines cannot be added to a suspended or rejected factory.');

    const [created] = await tx.insert(factoryProductionLine).values({
      factoryId: input.factoryId,
      manufacturerId,
      lineCode: input.lineCode,
      name: input.name,
      productionCategory: input.productionCategory,
      productTypes: input.productTypes,
      productionCapacity: input.productionCapacity === null || input.productionCapacity === undefined ? null : String(input.productionCapacity),
      productionCapacityUnit: input.productionCapacityUnit || null,
    }).returning();
    if (!created) throw new Error('Production-line registration returned no record.');

    await tx.insert(factoryProductionStage).values(input.stages.map((stage) => ({ ...stage, lineId: created.id })));
    await tx.insert(auditLog).values({
      userId: manufacturerId,
      action: 'FACTORY_PRODUCTION_LINE_REGISTERED',
      targetType: 'factory_production_line',
      targetId: created.id,
      metadata: JSON.stringify({ factoryId: input.factoryId, lineCode: created.lineCode, stageCount: input.stages.length }),
    });
    return created;
  });
}

export async function reviewFactory(actorUserId: string, input: FactoryReviewInput): Promise<typeof factory.$inferSelect> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(factory).where(eq(factory.id, input.factoryId)).for('update').limit(1);
    if (!current) throw new Error('Factory not found.');
    assertReviewTransition(current.onboardingStatus, input.decision);
    const statusUpdate = reviewStatusUpdate(input.decision);
    const [updated] = await tx.update(factory).set({
      onboardingStatus: input.decision,
      verificationStatus: statusUpdate.verificationStatus,
      approvedAt: statusUpdate.approvedAt,
      reviewedByUserId: actorUserId,
      reviewedAt: new Date(),
      reviewNote: input.note,
    }).where(eq(factory.id, input.factoryId)).returning();
    if (!updated) throw new Error('Factory review could not be saved.');

    await tx.insert(auditLog).values({
      userId: actorUserId,
      action: 'FACTORY_ONBOARDING_REVIEWED',
      targetType: 'factory',
      targetId: input.factoryId,
      beforeState: { onboardingStatus: current.onboardingStatus, verificationStatus: current.verificationStatus },
      afterState: { onboardingStatus: updated.onboardingStatus, verificationStatus: updated.verificationStatus },
      metadata: JSON.stringify({ note: input.note }),
    });
    return updated;
  });
}

export async function listFactoriesForReview(): Promise<FactorySummary[]> {
  const rows = await db
    .select({
      id: factory.id,
      manufacturerId: factory.manufacturerId,
      factoryCode: factory.factoryCode,
      name: factory.name,
      address: factory.address,
      latitude: factory.latitude,
      longitude: factory.longitude,
      industryType: factory.industryType,
      registrationReference: factory.registrationReference,
      productionCapacity: factory.productionCapacity,
      productionCapacityUnit: factory.productionCapacityUnit,
      onboardingStatus: factory.onboardingStatus,
      integrationStatus: factory.integrationStatus,
      connectivityStatus: factory.connectivityStatus,
      verificationStatus: factory.verificationStatus,
      submittedAt: factory.submittedAt,
      reviewedByUserId: factory.reviewedByUserId,
      reviewedAt: factory.reviewedAt,
      reviewNote: factory.reviewNote,
      approvedAt: factory.approvedAt,
      createdAt: factory.createdAt,
      updatedAt: factory.updatedAt,
      lineCount: sql<number>`COUNT(${factoryProductionLine.id})::int`.as('line_count'),
    })
    .from(factory)
    .leftJoin(factoryProductionLine, eq(factoryProductionLine.factoryId, factory.id))
    .groupBy(factory.id)
    .orderBy(asc(factory.onboardingStatus), desc(factory.createdAt));
  return rows.map((row) => ({ ...row, lineCount: Number(row.lineCount ?? 0) }));
}
