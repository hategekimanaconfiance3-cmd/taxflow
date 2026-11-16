'use server';

import { z } from 'zod';
import { requireRRAPermission, requireTraderSession } from '@/lib/auth-guard';
import {
  createFactory,
  listFactoriesForReview,
  listFactoryLines,
  listManufacturerFactories,
  registerProductionLine,
  reviewFactory as reviewFactoryRecord,
  submitFactoryForReview,
} from '@/lib/factory-integration-service';
import {
  factoryRegistrationSchema,
  factoryReviewSchema,
  productionLineRegistrationSchema,
} from '@/lib/validation/manufacturing-integration.schema';

const factoryIdSchema = z.string().uuid('Factory identifier is invalid.');

export async function getMyFactories() {
  const session = await requireTraderSession(['manufacturer']);
  return listManufacturerFactories(session.user.id);
}

export async function registerFactory(rawInput: unknown) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = factoryRegistrationSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Factory details are invalid.');
  return createFactory(session.user.id, parsed.data);
}

export async function submitFactory(factoryId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = factoryIdSchema.safeParse(factoryId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Factory identifier is invalid.');
  return submitFactoryForReview(session.user.id, parsed.data);
}

export async function registerFactoryProductionLine(rawInput: unknown) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = productionLineRegistrationSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Production-line details are invalid.');
  return registerProductionLine(session.user.id, parsed.data);
}

export async function getMyFactoryLines(factoryId: string) {
  const session = await requireTraderSession(['manufacturer']);
  const parsed = factoryIdSchema.safeParse(factoryId);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Factory identifier is invalid.');
  return listFactoryLines(parsed.data, session.user.id);
}

export async function getFactoriesForOfficerReview() {
  await requireRRAPermission('industrial.factory.read');
  return listFactoriesForReview();
}

export async function reviewFactory(rawInput: unknown) {
  const session = await requireRRAPermission('industrial.factory.review');
  const parsed = factoryReviewSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Factory review details are invalid.');
  return reviewFactoryRecord(session.user.id, parsed.data);
}
