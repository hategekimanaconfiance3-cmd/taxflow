'use server';

import { and, asc, eq } from 'drizzle-orm';
import db from '@/db/drizzle';
import { auditLog, customer } from '@/db/schema';
import { requireTraderSession } from '@/lib/auth-guard';
import { saveCustomerSchema } from '@/lib/validation/customer.schema';

export type CustomerDirectoryRow = typeof customer.$inferSelect;

export async function getBusinessCustomers(includeInactive = true): Promise<CustomerDirectoryRow[]> {
  const session = await requireTraderSession();
  const conditions = [eq(customer.businessId, session.user.id)];
  if (!includeInactive) conditions.push(eq(customer.isActive, true));
  return db.select().from(customer).where(and(...conditions)).orderBy(asc(customer.name)).limit(500);
}

export async function saveBusinessCustomer(input: unknown): Promise<{ success: true; customer: CustomerDirectoryRow } | { success: false; error: string }> {
  const parsed = saveCustomerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Check the customer details.' };
  const session = await requireTraderSession();
  const { id, customer: details } = parsed.data;
  const tinNumber = details.tinNumber || null;
  const phone = details.phone || null;
  const email = details.email || null;

  try {
    return await db.transaction(async (tx) => {
      if (id) {
        const [existing] = await tx.select().from(customer)
          .where(and(eq(customer.id, id), eq(customer.businessId, session.user.id))).for('update').limit(1);
        if (!existing) return { success: false as const, error: 'Customer record was not found for this business.' };
        const [updated] = await tx.update(customer).set({
          name: details.name,
          customerType: details.customerType,
          tinNumber,
          phone,
          email,
          updatedAt: new Date(),
        }).where(eq(customer.id, existing.id)).returning();
        if (!updated) throw new Error('Customer update returned no row.');
        await tx.insert(auditLog).values({
          userId: session.user.id, action: 'CUSTOMER_UPDATED', targetType: 'customer', targetId: updated.id,
          beforeState: { customerType: existing.customerType, isActive: existing.isActive },
          afterState: { customerType: updated.customerType, isActive: updated.isActive },
          metadata: JSON.stringify({ changedFields: ['name', 'customerType', 'tinNumber', 'phone', 'email'] }),
        });
        return { success: true as const, customer: updated };
      }

      const [created] = await tx.insert(customer).values({
        businessId: session.user.id,
        name: details.name,
        customerType: details.customerType,
        tinNumber,
        phone,
        email,
      }).returning();
      if (!created) throw new Error('Customer registration returned no row.');
      await tx.insert(auditLog).values({
        userId: session.user.id, action: 'CUSTOMER_CREATED', targetType: 'customer', targetId: created.id,
        afterState: { customerType: created.customerType, isActive: created.isActive },
        metadata: JSON.stringify({ customerType: created.customerType }),
      });
      return { success: true as const, customer: created };
    });
  } catch (error) {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error('Customer directory write failed', { userId: session.user.id, operation: id ? 'update' : 'create', errorName, errorCode });
    if (errorCode === '23505') {
      return { success: false, error: 'A customer with this TIN is already in your directory.' };
    }
    return { success: false, error: 'Unable to save this customer. Please try again.' };
  }
}

export async function setBusinessCustomerActive(id: unknown, isActive: unknown): Promise<{ success: boolean; error?: string }> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || typeof isActive !== 'boolean') {
    return { success: false, error: 'Customer update is invalid.' };
  }
  const session = await requireTraderSession();
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(customer)
        .where(and(eq(customer.id, id), eq(customer.businessId, session.user.id))).for('update').limit(1);
      if (!existing) return { success: false, error: 'Customer record was not found for this business.' };
      if (existing.isActive === isActive) return { success: true };
      const [updated] = await tx.update(customer).set({ isActive, updatedAt: new Date() })
        .where(and(eq(customer.id, id), eq(customer.businessId, session.user.id))).returning({ id: customer.id });
      if (!updated) return { success: false, error: 'Customer status could not be updated.' };
      await tx.insert(auditLog).values({
        userId: session.user.id, action: isActive ? 'CUSTOMER_REACTIVATED' : 'CUSTOMER_DEACTIVATED',
        targetType: 'customer', targetId: id,
        beforeState: { isActive: existing.isActive }, afterState: { isActive },
      });
      return { success: true };
    });
  } catch (error) {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error('Customer directory status update failed', { userId: session.user.id, customerId: id, errorName, errorCode });
    return { success: false, error: 'Unable to update this customer. Please try again.' };
  }
}
