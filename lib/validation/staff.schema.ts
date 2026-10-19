import { z } from 'zod';
import { RRA_ROLE_OPTIONS, type RRAProposedRole, type RRARole } from '@/lib/rra-rbac';

export const STAFF_ROLE_OPTIONS = [
  ...RRA_ROLE_OPTIONS,
  { value: 'compliance_officer', label: 'Legacy · Compliance Officer' },
  { value: 'audit_officer', label: 'Legacy · Audit Officer' },
  { value: 'stock_officer', label: 'Legacy · Stock Monitoring Officer' },
  { value: 'correction_officer', label: 'Legacy · Correction Officer' },
  { value: 'reporting_officer', label: 'Legacy · Reporting & Analytics' },
] as const satisfies readonly { value: RRARole; label: string }[];

const STAFF_ROLES = STAFF_ROLE_OPTIONS.map((option) => option.value) as [RRARole, ...RRARole[]];
export const staffRoleSchema = z.enum(STAFF_ROLES);
export const staffAssignmentRoleSchema = z.enum(RRA_ROLE_OPTIONS.map((option) => option.value) as [RRAProposedRole, ...RRAProposedRole[]]);

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(128, 'Password must be no more than 128 characters.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/\d/, 'Password must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol.');

export const staffAccountSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter the staff member’s full name.').max(120),
    email: z.string().trim().email('Enter a valid email address.').max(254),
    staffId: z
      .string()
      .trim()
      .min(4, 'Staff ID must be at least 4 characters.')
      .max(20, 'Staff ID must be at most 20 characters.')
      .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, 'Use letters, numbers, and single dashes only.'),
    department: z.string().trim().min(2, 'Enter a department.').max(100),
    clearanceLevel: staffAssignmentRoleSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm the password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const resetStaffPasswordSchema = z
  .object({
    staffRecordId: z.string().trim().min(1, 'Select a staff member.'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm the password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export type StaffAccountInput = z.input<typeof staffAccountSchema>;
export type ResetStaffPasswordInput = z.input<typeof resetStaffPasswordSchema>;
export type StaffAccountFields = keyof StaffAccountInput;
export type ResetPasswordFields = keyof ResetStaffPasswordInput;
