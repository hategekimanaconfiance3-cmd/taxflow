import { and, eq, sql } from 'drizzle-orm';
import db from '@/db/drizzle';
import { taxPayment, vatRecord } from '@/db/schema';
import { getSystemConfig } from '@/lib/actions/system-config.action';

/** Server-only compliance calculation for trusted business workflows. */
export async function getBusinessComplianceStatus(targetId: string) {
  const vatResult = await db
    .select({
      vatType: vatRecord.vatType,
      total: sql<number>`COALESCE(SUM(${vatRecord.amount}), 0)::float8`.as('total'),
    })
    .from(vatRecord)
    .where(and(eq(vatRecord.businessId, targetId), eq(vatRecord.isFrozen, false)))
    .groupBy(vatRecord.vatType);

  const vatOutput = Number(vatResult.find((row) => row.vatType === 'output')?.total) || 0;
  const vatInput = Number(vatResult.find((row) => row.vatType === 'input')?.total) || 0;
  const netOwed = Math.max(0, vatOutput - vatInput);
  const [paymentResult] = await db
    .select({ totalPaid: sql<number>`COALESCE(SUM(${taxPayment.amount}), 0)::float8`.as('total_paid') })
    .from(taxPayment)
    .where(sql`${taxPayment.businessId} = ${targetId} AND ${taxPayment.status} = 'confirmed'`);

  const totalPaid = Number(paymentResult?.totalPaid) || 0;
  const config = await getSystemConfig();
  const compliancePct = netOwed === 0 ? 100 : Math.min(100, (totalPaid / netOwed) * 100);
  return {
    vatOutput,
    vatInput,
    netOwed,
    totalPaid,
    outstanding: Math.max(0, netOwed - totalPaid),
    compliancePct: Math.round(compliancePct * 10) / 10,
    isCompliant: compliancePct >= config.complianceThreshold * 100,
    threshold: config.complianceThreshold * 100,
  };
}
