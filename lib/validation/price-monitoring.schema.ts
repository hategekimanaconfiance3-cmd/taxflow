import { z } from 'zod';

export const merchantPriceUpdateSchema = z.object({
  price: z.number().finite().int().positive().max(100_000_000),
  reason: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().uuid(),
}).strict();

export const priceAlertQuerySchema = z.object({
  direction: z.enum(['increase', 'decrease']).optional(),
  status: z.enum(['pending', 'reviewed', 'escalated', 'suspicious', 'resolved']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.string().trim().max(160).optional(),
  district: z.string().trim().max(160).optional(),
  tin: z.string().trim().max(32).optional(),
  product: z.string().trim().max(160).optional(),
  productId: z.string().trim().max(128).optional(),
  businessId: z.string().trim().max(128).optional(),
  minPercentage: z.coerce.number().finite().optional(),
  maxPercentage: z.coerce.number().finite().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The start date must be before the end date.',
    path: ['from'],
  })
  .refine((value) => value.minPercentage === undefined || value.maxPercentage === undefined || value.minPercentage <= value.maxPercentage, {
    message: 'The minimum percentage must be before the maximum percentage.',
    path: ['minPercentage'],
  });

export const priceAlertActionSchema = z.object({
  action: z.enum(['review', 'escalate', 'mark_suspicious', 'resolve']),
  reason: z.string().trim().min(5).max(1_000),
}).strict();

export const priceJurisdictionSchema = z.object({
  scopeType: z.enum(['national', 'province', 'district']),
  province: z.string().trim().max(160).optional(),
  district: z.string().trim().max(160).optional(),
  reason: z.string().trim().min(5).max(1_000),
}).strict().superRefine((value, context) => {
  if (value.scopeType === 'national' && (value.province || value.district)) context.addIssue({ code: 'custom', message: 'National scope must not include a province or district.', path: ['scopeType'] });
  if (value.scopeType === 'province' && (!value.province || value.district)) context.addIssue({ code: 'custom', message: 'Province scope requires a province only.', path: ['province'] });
  if (value.scopeType === 'district' && (!value.province || !value.district)) context.addIssue({ code: 'custom', message: 'District scope requires both province and district.', path: ['district'] });
});

export const priceMonitoringPolicySchema = z.object({
  scopeType: z.enum(['default', 'category', 'product']),
  scopeKey: z.string().trim().min(1).max(160),
  increaseThresholdPercent: z.number().finite().min(0).max(100_000),
  decreaseThresholdPercent: z.number().finite().min(0).max(100_000),
  absoluteDifferenceRwf: z.number().int().min(0).max(100_000_000),
  mediumThresholdPercent: z.number().finite().min(0).max(100_000),
  highThresholdPercent: z.number().finite().min(0).max(100_000),
  criticalThresholdPercent: z.number().finite().min(0).max(100_000),
  reason: z.string().trim().min(5).max(1_000),
}).strict().superRefine((value, context) => {
  if (value.scopeType === 'default' && value.scopeKey !== '*') context.addIssue({ code: 'custom', message: 'The default policy must use * as its scope key.', path: ['scopeKey'] });
  if (value.scopeType !== 'default' && value.scopeKey === '*') context.addIssue({ code: 'custom', message: 'Category and product policies require a specific scope key.', path: ['scopeKey'] });
  if (value.mediumThresholdPercent < value.increaseThresholdPercent || value.mediumThresholdPercent < value.decreaseThresholdPercent) context.addIssue({ code: 'custom', message: 'Medium severity must be at or above both direction thresholds.', path: ['mediumThresholdPercent'] });
  if (value.highThresholdPercent < value.mediumThresholdPercent || value.criticalThresholdPercent < value.highThresholdPercent) context.addIssue({ code: 'custom', message: 'Severity thresholds must be ordered low, medium, high, critical.', path: ['criticalThresholdPercent'] });
});

export const priceAlertExplanationSchema = z.object({
  explanation: z.string().trim().min(5).max(5_000),
  supportingDocumentUrl: z.string().trim().url().max(2_000).optional(),
}).strict();

