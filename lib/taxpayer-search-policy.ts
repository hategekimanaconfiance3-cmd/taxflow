import { hasRRAPermission, type RRARole } from "@/lib/rra-rbac";

export interface TaxpayerSearchBaseRow {
  id: string;
  name: string;
  businessName: string | null;
  tinNumber: string | null;
  role: string | null;
  clearanceStatus: string | null;
  createdAt: Date;
}

export interface TaxpayerSearchContactFields {
  email: string;
  phoneNumber: string | null;
}

export type TaxpayerSearchRow = TaxpayerSearchBaseRow & Partial<TaxpayerSearchContactFields>;

/** Contact details are part of the taxpayer compliance profile, not basic search access. */
export function canReadTaxpayerSearchContact(roles: readonly RRARole[]): boolean {
  return roles.some((role) => hasRRAPermission(role, "taxpayer.compliance.read"));
}

/** Project a search result using server-authorized fields, even if a caller supplies a wider row. */
export function projectTaxpayerSearchRow(
  row: TaxpayerSearchBaseRow & Partial<TaxpayerSearchContactFields>,
  roles: readonly RRARole[],
): TaxpayerSearchRow {
  const { id, name, businessName, tinNumber, role, clearanceStatus, createdAt } = row;
  const base = { id, name, businessName, tinNumber, role, clearanceStatus, createdAt };

  if (!canReadTaxpayerSearchContact(roles)) return base;

  return { ...base, email: row.email ?? "", phoneNumber: row.phoneNumber ?? null };
}
