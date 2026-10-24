import { z } from 'zod';
import { RRA_ROLE_OPTIONS, RRA_ROLE_PERMISSIONS, RRA_ROLE_VALUES, type RRAProposedRole, type RRARole } from '@/lib/rra-rbac';

const LEGACY_ROLE_LABELS: Partial<Record<RRARole, string>> = {
  compliance_officer: 'Legacy · Compliance Officer',
  audit_officer: 'Legacy · Audit Officer',
  stock_officer: 'Legacy · Stock Monitoring Officer',
  correction_officer: 'Legacy · Correction Officer',
  reporting_officer: 'Legacy · Reporting & Analytics',
};

export const STAFF_ROLE_OPTIONS = RRA_ROLE_VALUES.map((value) => {
  const proposed = RRA_ROLE_OPTIONS.find((role) => role.value === value);
  return {
    value,
    label: proposed?.label ?? LEGACY_ROLE_LABELS[value] ?? value,
    permissions: (RRA_ROLE_PERMISSIONS[value] ?? []).join(', '),
  };
}) as readonly { value: RRARole; label: string; permissions: string }[];
export const STAFF_ASSIGNMENT_ROLE_OPTIONS = RRA_ROLE_OPTIONS.map((role) => ({
  value: role.value,
  label: role.label,
  permissions: (RRA_ROLE_PERMISSIONS[role.value] ?? []).join(', '),
}));

const STAFF_ROLES = STAFF_ROLE_OPTIONS.map((option) => option.value) as [RRARole, ...RRARole[]];
const ASSIGNABLE_STAFF_ROLES = RRA_ROLE_OPTIONS.map((option) => option.value) as [RRAProposedRole, ...RRAProposedRole[]];
export const staffRoleSchema = z.enum(STAFF_ROLES);
export const staffAssignmentRoleSchema = z.enum(ASSIGNABLE_STAFF_ROLES);
export const staffRolesSchema = z.array(staffRoleSchema).min(1, 'Choose at least one role.').max(STAFF_ROLE_OPTIONS.length)
  .refine((roles) => new Set(roles).size === roles.length, 'Each role can only be assigned once.')
  .refine((roles) => !roles.includes('super_admin') || roles.length === 1, 'Super Admin must be the only assigned role.');
const staffAccountRolesSchema = z.array(staffAssignmentRoleSchema).min(1, 'Choose at least one role.').max(RRA_ROLE_OPTIONS.length)
  .refine((roles) => new Set(roles).size === roles.length, 'Each role can only be assigned once.')
  .refine((roles) => !roles.includes('super_admin') || roles.length === 1, 'Super Admin must be the only assigned role.');

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
    roles: staffAccountRolesSchema,
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
