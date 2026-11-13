import "dotenv/config";
import { eq } from "drizzle-orm";
import db from "../db/drizzle";
import { paymentMethod, rraCollectionAccount } from "../db/schema";
import { encryptPaymentData, isPaymentDataEncrypted } from "../lib/payment-data-encryption";

async function main() {
  const apply = process.argv.includes("--apply");
  const methods = await db.select({ id: paymentMethod.id, value: paymentMethod.fullIdentifier }).from(paymentMethod);
  const accounts = await db.select({ id: rraCollectionAccount.id, value: rraCollectionAccount.bankAccountNumber })
    .from(rraCollectionAccount);

  let methodsUpdated = 0;
  let accountsUpdated = 0;
  for (const row of methods) {
    if (!row.value || isPaymentDataEncrypted(row.value)) continue;
    methodsUpdated++;
    if (apply) await db.update(paymentMethod).set({ fullIdentifier: encryptPaymentData(row.value) }).where(eq(paymentMethod.id, row.id));
  }
  for (const row of accounts) {
    if (!row.value || isPaymentDataEncrypted(row.value)) continue;
    accountsUpdated++;
    if (apply) await db.update(rraCollectionAccount).set({ bankAccountNumber: encryptPaymentData(row.value) }).where(eq(rraCollectionAccount.id, row.id));
  }

  console.log(`${apply ? "Encrypted" : "Would encrypt"} ${methodsUpdated} saved payment identifiers and ${accountsUpdated} RRA bank account numbers.`);
  if (!apply) console.log("Review the counts, set PAYMENT_DATA_ENCRYPTION_KEY, then rerun with --apply.");
}

main().catch((error) => {
  console.error("Payment data encryption backfill failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => {
  await db.$client.end();
});
