import { z } from 'zod';

const trimmedText = (label: string, maximum: number) => z.string().trim().min(1, `${label} is required.`).max(maximum, `${label} is too long.`);

export const factoryRegistrationSchema = z.object({
  factoryCode: trimmedText('Factory code', 64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Factory code contains unsupported characters.'),
  name: trimmedText('Factory name', 160),
  address: trimmedText('Factory address', 500),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  industryType: trimmedText('Industry type', 80).default('beverage'),
  registrationReference: z.string().trim().max(120).nullable().optional(),
  productionCapacity: z.number().finite().positive().max(1_000_000_000).nullable().optional(),
  productionCapacityUnit: z.string().trim().max(40).nullable().optional(),
}).superRefine((value, context) => {
  const hasLatitude = value.latitude !== null && value.latitude !== undefined;
  const hasLongitude = value.longitude !== null && value.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    context.addIssue({ code: 'custom', path: ['latitude'], message: 'Latitude and longitude must be provided together.' });
  }

  const hasCapacity = value.productionCapacity !== null && value.productionCapacity !== undefined;
  const hasCapacityUnit = Boolean(value.productionCapacityUnit);
  if (hasCapacity !== hasCapacityUnit) {
    context.addIssue({ code: 'custom', path: ['productionCapacity'], message: 'Production capacity and its unit must be provided together.' });
  }
});

export const productionLineRegistrationSchema = z.object({
  factoryId: z.string().uuid('Factory identifier is invalid.'),
  lineCode: trimmedText('Line code', 64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Line code contains unsupported characters.'),
  name: trimmedText('Line name', 160),
  productionCategory: trimmedText('Production category', 80).default('beverage'),
  productTypes: z.array(trimmedText('Product type', 80)).max(50).default([]),
  productionCapacity: z.number().finite().positive().max(1_000_000_000).nullable().optional(),
  productionCapacityUnit: z.string().trim().max(40).nullable().optional(),
  stages: z.array(z.object({
    stageCode: trimmedText('Stage code', 64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Stage code contains unsupported characters.'),
    name: trimmedText('Stage name', 160),
    sequenceNumber: z.number().int().positive().max(10_000),
  }).strict()).min(1).max(100),
}).superRefine((value, context) => {
  const hasCapacity = value.productionCapacity !== null && value.productionCapacity !== undefined;
  const hasCapacityUnit = Boolean(value.productionCapacityUnit);
  if (hasCapacity !== hasCapacityUnit) {
    context.addIssue({ code: 'custom', path: ['productionCapacity'], message: 'Production capacity and its unit must be provided together.' });
  }

  const codes = new Set<string>();
  const sequences = new Set<number>();
  value.stages.forEach((stage, index) => {
    if (codes.has(stage.stageCode.toLowerCase())) {
      context.addIssue({ code: 'custom', path: ['stages', index, 'stageCode'], message: 'Stage codes must be unique within a line.' });
    }
    if (sequences.has(stage.sequenceNumber)) {
      context.addIssue({ code: 'custom', path: ['stages', index, 'sequenceNumber'], message: 'Stage sequence numbers must be unique within a line.' });
    }
    codes.add(stage.stageCode.toLowerCase());
    sequences.add(stage.sequenceNumber);
  });
});

export const factoryReviewSchema = z.object({
  factoryId: z.string().uuid('Factory identifier is invalid.'),
  decision: z.enum(['under_review', 'technical_assessment', 'integration_pending', 'integration_testing', 'approved', 'active', 'suspended', 'rejected']),
  note: z.string().trim().min(1, 'A review note is required.').max(2_000),
}).strict();

const positiveNumber = z.number().finite().positive().max(1_000_000_000);

export const equipmentRegistrationSchema = z.object({
  factoryId: z.string().uuid('Factory identifier is invalid.'),
  productionLineId: z.string().uuid('Production-line identifier is invalid.'),
  equipmentCode: trimmedText('Equipment code', 80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Equipment code contains unsupported characters.'),
  name: trimmedText('Equipment name', 160),
  equipmentType: trimmedText('Equipment type', 100),
  equipmentManufacturer: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  serialNumber: z.string().trim().max(160).nullable().optional(),
  installationDate: z.string().datetime({ offset: true }).nullable().optional(),
  operationalStatus: z.enum(['registered', 'active', 'maintenance', 'inactive']).default('registered'),
  communicationProtocol: z.enum(['unknown', 'opc_ua', 'modbus_tcp', 'modbus_rtu', 'industrial_ethernet', 'vendor_api', 'erp_mes', 'scada_historian', 'other']).default('unknown'),
  integrationMethod: z.enum(['gateway', 'api', 'manual_evidence', 'pending']).default('gateway'),
  sensorConfiguration: z.record(z.string(), z.unknown()).default({}),
  measurementUnits: z.array(trimmedText('Measurement unit', 40)).max(100).default([]),
  expectedProductionCapacity: positiveNumber.nullable().optional(),
  expectedProductionCapacityUnit: z.string().trim().max(40).nullable().optional(),
}).superRefine((value, context) => {
  const hasCapacity = value.expectedProductionCapacity !== null && value.expectedProductionCapacity !== undefined;
  const hasCapacityUnit = Boolean(value.expectedProductionCapacityUnit);
  if (hasCapacity !== hasCapacityUnit) context.addIssue({ code: 'custom', path: ['expectedProductionCapacity'], message: 'Expected capacity and its unit must be provided together.' });
});

export const calibrationRecordSchema = z.object({
  equipmentId: z.string().uuid('Equipment identifier is invalid.'),
  calibrationReference: trimmedText('Calibration reference', 120),
  status: z.enum(['valid', 'failed', 'superseded']),
  calibratedAt: z.string().datetime({ offset: true }),
  nextCalibrationAt: z.string().datetime({ offset: true }).nullable().optional(),
  certificateReference: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.nextCalibrationAt && new Date(value.nextCalibrationAt) <= new Date(value.calibratedAt)) {
    context.addIssue({ code: 'custom', path: ['nextCalibrationAt'], message: 'Next calibration must be after the calibration date.' });
  }
});

export const equipmentUpdateSchema = z.object({
  equipmentId: z.string().uuid('Equipment identifier is invalid.'),
  operationalStatus: z.enum(['active', 'maintenance', 'inactive', 'removed']).optional(),
  communicationProtocol: z.enum(['unknown', 'opc_ua', 'modbus_tcp', 'modbus_rtu', 'industrial_ethernet', 'vendor_api', 'erp_mes', 'scada_historian', 'other']).optional(),
  integrationMethod: z.enum(['gateway', 'api', 'manual_evidence', 'pending']).optional(),
  sensorConfiguration: z.record(z.string(), z.unknown()).optional(),
  measurementUnits: z.array(trimmedText('Measurement unit', 40)).max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 1, 'At least one equipment change is required.');

export const gatewayRegistrationSchema = z.object({
  factoryId: z.string().uuid('Factory identifier is invalid.'),
  gatewayCode: trimmedText('Gateway code', 80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Gateway code contains unsupported characters.'),
  name: trimmedText('Gateway name', 160),
  softwareVersion: z.string().trim().max(80).nullable().optional(),
});

export const industrialIntegrationRequestSchema = z.object({
  factoryId: z.string().uuid('Factory identifier is invalid.'),
  environment: z.enum(['sandbox', 'production']),
  integrationName: trimmedText('Integration name', 160),
  requestedEquipmentIds: z.array(z.string().uuid('Equipment identifier is invalid.')).min(1).max(500),
  gatewayName: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
  clientRequestId: z.string().trim().max(120).nullable().optional(),
}).strict();

export const industrialIntegrationReviewSchema = z.object({
  requestId: z.string().uuid('Integration-request identifier is invalid.'),
  decision: z.enum(['under_review', 'approved', 'rejected']),
  note: z.string().trim().min(1, 'A review note is required.').max(2_000),
  authorizedEquipmentIds: z.array(z.string().uuid('Equipment identifier is invalid.')).max(500).default([]),
}).strict();

export const industrialIntegrationActionSchema = z.object({
  integrationId: z.string().uuid('Integration identifier is invalid.'),
  reason: z.string().trim().min(1, 'A reason is required.').max(2_000),
}).strict();

const industrialEventMeasurementSchema = z.record(z.string().trim().min(1).max(80), z.number().finite().max(1_000_000_000_000));

export const industrialEventSchema = z.object({
  eventId: trimmedText('Event identifier', 160),
  gatewayId: z.string().uuid('Gateway identifier is invalid.'),
  factoryId: z.string().uuid('Factory identifier is invalid.'),
  lineId: z.string().uuid('Production-line identifier is invalid.'),
  equipmentId: z.string().uuid('Equipment identifier is invalid.'),
  batchId: z.string().uuid('Batch identifier is invalid.').nullable().optional(),
  batchReference: z.string().trim().max(160).nullable().optional(),
  eventType: z.enum(['PRODUCTION_COUNT', 'QUALITY_RESULT', 'STAGE_COMPLETION', 'MACHINE_STATUS', 'MEASUREMENT', 'COUNTER_RESET', 'HEARTBEAT']),
  stageCode: z.string().trim().max(80).nullable().optional(),
  stageSequenceNumber: z.number().int().positive().max(10_000).nullable().optional(),
  sequenceNumber: z.number().int().positive().max(2_147_483_647),
  eventTimestamp: z.string().datetime({ offset: true }),
  measurements: industrialEventMeasurementSchema,
  unit: z.string().trim().max(40).nullable().optional(),
  source: z.enum(['industrial_gateway', 'simulator']).default('industrial_gateway'),
  schemaVersion: z.string().regex(/^\d+\.\d+$/, 'Schema version must use major.minor format.'),
}).strict().superRefine((value, context) => {
  const hasStageCode = Boolean(value.stageCode);
  const hasStageSequence = value.stageSequenceNumber !== null && value.stageSequenceNumber !== undefined;
  if (hasStageCode !== hasStageSequence) context.addIssue({ code: 'custom', path: ['stageCode'], message: 'Stage code and stage sequence must be provided together.' });
  for (const [key, measurement] of Object.entries(value.measurements)) {
    if (/(count|counter|produced|rejected|rate)/i.test(key) && measurement < 0) {
      context.addIssue({ code: 'custom', path: ['measurements', key], message: 'Production counters and rates cannot be negative.' });
    }
  }
});

export const integrationPolicySchema = z.object({
  factoryId: z.string().uuid('Factory identifier is invalid.'),
  mandatory: z.boolean().default(true),
  requiredEquipmentCount: z.number().int().nonnegative().max(10_000).default(1),
  requiredGatewayCount: z.number().int().nonnegative().max(1_000).default(1),
  integrationTestRequired: z.boolean().default(true),
  exceptionStatus: z.enum(['none', 'pending', 'approved', 'rejected']).default('none'),
  exceptionReason: z.string().trim().max(2_000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.exceptionStatus !== 'none' && !value.exceptionReason) context.addIssue({ code: 'custom', path: ['exceptionReason'], message: 'An exception reason is required.' });
});

export type FactoryRegistrationInput = z.infer<typeof factoryRegistrationSchema>;
export type ProductionLineRegistrationInput = z.infer<typeof productionLineRegistrationSchema>;
export type FactoryReviewInput = z.infer<typeof factoryReviewSchema>;
export type EquipmentRegistrationInput = z.infer<typeof equipmentRegistrationSchema>;
export type CalibrationRecordInput = z.infer<typeof calibrationRecordSchema>;
export type EquipmentUpdateInput = z.infer<typeof equipmentUpdateSchema>;
export type GatewayRegistrationInput = z.infer<typeof gatewayRegistrationSchema>;
export type IndustrialIntegrationRequestInput = z.infer<typeof industrialIntegrationRequestSchema>;
export type IndustrialIntegrationReviewInput = z.infer<typeof industrialIntegrationReviewSchema>;
export type IndustrialIntegrationActionInput = z.infer<typeof industrialIntegrationActionSchema>;
export type IndustrialEventInput = z.infer<typeof industrialEventSchema>;
export type IntegrationPolicyInput = z.infer<typeof integrationPolicySchema>;
