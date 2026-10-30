import { z } from 'zod';

const amount = z.string().trim().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/, 'Enter an amount with no more than two decimal places.')
  .refine((value) => /[1-9]/.test(value.replace('.', '')), 'Amount must be greater than zero.');

export const recordOfficialTaxAssessmentSchema = z.object({
  taxpayerId: z.string().trim().min(1).max(128),
  taxType: z.string().trim().min(1).max(80),
  periodKey: z.string().trim().min(1).max(32),
  assessmentReference: z.string().trim().min(1).max(120),
  assessmentDate: z.iso.datetime(),
  dueDate: z.iso.datetime().optional(),
  originalAmount: amount,
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  supportingEvidenceReference: z.string().trim().min(1).max(500),
  sourcePayloadHash: z.string().trim().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();

export const taxObligationIdSchema = z.object({ obligationId: z.uuid() }).strict();

export const taxObligationAdjustmentProposalSchema = z.object({
  obligationId: z.uuid(),
  kind: z.enum(['INCREASE', 'DECREASE', 'CREDIT', 'EXEMPTION']),
  amount,
  reason: z.string().trim().min(10).max(1000),
  evidenceReference: z.string().trim().min(1).max(500),
}).strict();

export const taxObligationAdjustmentDecisionSchema = z.object({
  adjustmentId: z.uuid(),
  reason: z.string().trim().min(10).max(500),
}).strict();

export const disputeTaxObligationSchema = z.object({
  obligationId: z.uuid(),
  reason: z.string().trim().min(10).max(1000),
  evidenceReference: z.string().trim().min(1).max(500),
}).strict();
