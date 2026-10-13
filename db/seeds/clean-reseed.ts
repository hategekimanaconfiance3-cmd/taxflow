import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, or, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
    user,
    account,
    product,
    stock,
    transaction,
    vatRecord,
    taxPayment,
    auditLog,
    notification,
    importDeclaration,
    dispute,
    systemConfig,
    staffBulletin,
    supportTicket,
} from "../schema";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// CLEAN RESEED — Delete all non-auth data + reseed focused supply chain
// ---------------------------------------------------------------------------
// Preserves: user, session, account, verification, rra_staff
// Clears:    everything else
// Then seeds: products, stock (Confiance only), transactions, VAT, payments
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === "production") throw new Error("Demo data seeding is disabled in production.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to seed demo data.");
if (!process.env.TAXFLOW_SEED_PASSWORD || process.env.TAXFLOW_SEED_PASSWORD.length < 12) {
    throw new Error("Set TAXFLOW_SEED_PASSWORD to a value of at least 12 characters.");
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);
const SEED_PASSWORD = process.env.TAXFLOW_SEED_PASSWORD;

const VAT_RATE = 0.18;

// ── Stable IDs for seed traders ─────────────────────────────────────────────

const IDS = {
    confiance: crypto.randomUUID(),
    gatete: crypto.randomUUID(),
    uwimana: crypto.randomUUID(),
    niyonzima: crypto.randomUUID(),
    diane: crypto.randomUUID(),

    soap: crypto.randomUUID(),
    sugar: crypto.randomUUID(),
    rice: crypto.randomUUID(),
    cement: crypto.randomUUID(),
    cookingOil: crypto.randomUUID(),
};

// ── Trader Data ─────────────────────────────────────────────────────────────

const TRADERS = [
    {
        id: IDS.confiance,
        name: "Confiance Hategekimana",
        email: "confiance@construction.rw",
        phone: "+250788000001",
        nationalId: "1199880012345678",
        tinNumber: "100456789",
        businessName: "Confiance Construction Ltd",
        role: "manufacturer",
        clearanceStatus: "approved",
    },
    {
        id: IDS.gatete,
        name: "Elias Gatete",
        email: "elllyers@gmail.com",
        phone: "+250788000002",
        nationalId: "1199570087654321",
        tinNumber: "100789456",
        businessName: "Gatete Trading Co",
        role: "wholesaler",
        clearanceStatus: "approved",
    },
    {
        id: IDS.uwimana,
        name: "Marie Uwimana",
        email: "marie@uwimana.rw",
        phone: "+250788000003",
        nationalId: "1200190056781234",
        tinNumber: "100321654",
        businessName: "Uwimana General Store",
        role: "retailer",
        clearanceStatus: "approved",
    },
    {
        id: IDS.niyonzima,
        name: "Jean Pierre Niyonzima",
        email: "jpniyonzima@gmail.com",
        phone: "+250788000004",
        nationalId: "1198560043219876",
        tinNumber: "100654987",
        businessName: "Niyonzima Wholesale",
        role: "wholesaler",
        clearanceStatus: "under_review",
    },
    {
        id: IDS.diane,
        name: "Diane Mukamana",
        email: "diane@mukamana.rw",
        phone: "+250788000005",
        nationalId: "1199290078563412",
        tinNumber: "100987321",
        businessName: "Diane Fashion & Retail",
        role: "retailer",
        clearanceStatus: "approved",
    },
];

// ── Products ────────────────────────────────────────────────────────────────

const PRODUCTS = [
    { id: IDS.soap,       name: "Bar Soap",    unit: "unit",  categoryCode: "FMCG-001" },
    { id: IDS.sugar,      name: "Sugar",       unit: "kg",    categoryCode: "FOOD-001" },
    { id: IDS.rice,       name: "Rice",        unit: "kg",    categoryCode: "FOOD-002" },
    { id: IDS.cement,     name: "Cement",      unit: "kg",    categoryCode: "CONST-001" },
    { id: IDS.cookingOil, name: "Cooking Oil", unit: "liter", categoryCode: "FOOD-003" },
];

// ── Confiance initial stock (manufactured goods) ────────────────────────────

const CONFIANCE_STOCK: Record<string, { qty: number; price: number }> = {
    [IDS.soap]:       { qty: 2000, price: 400 },
    [IDS.sugar]:      { qty: 1500, price: 900 },
    [IDS.rice]:       { qty: 1800, price: 700 },
    [IDS.cement]:     { qty: 800,  price: 2200 },
    [IDS.cookingOil]: { qty: 1200, price: 1500 },
};

// ── Transactions — realistic supply chain flow ──────────────────────────────

interface TxnDef {
    sellerId: string;
    buyerId: string | null;
    buyerName?: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    status: "pending" | "confirmed" | "completed" | "rejected";
    daysAgo: number;
}

const TRANSACTIONS: TxnDef[] = [
    // ── Month 1 (~ 60 days ago): Confiance manufactures and sells to Gatete ──
    { sellerId: IDS.confiance, buyerId: IDS.gatete, productId: IDS.soap,       quantity: 400, unitPrice: 500,  status: "confirmed", daysAgo: 58 },
    { sellerId: IDS.confiance, buyerId: IDS.gatete, productId: IDS.sugar,      quantity: 600, unitPrice: 1000, status: "confirmed", daysAgo: 55 },
    { sellerId: IDS.confiance, buyerId: IDS.gatete, productId: IDS.rice,       quantity: 500, unitPrice: 800,  status: "confirmed", daysAgo: 52 },

    // ── Month 2 (~ 30 days ago): Gatete resells to Uwimana (retail) ──
    { sellerId: IDS.gatete,   buyerId: IDS.uwimana, productId: IDS.soap,       quantity: 200, unitPrice: 700,  status: "confirmed", daysAgo: 35 },
    { sellerId: IDS.gatete,   buyerId: IDS.uwimana, productId: IDS.sugar,      quantity: 300, unitPrice: 1400, status: "confirmed", daysAgo: 32 },
    { sellerId: IDS.confiance, buyerId: IDS.diane,  productId: IDS.cookingOil,  quantity: 150, unitPrice: 1800, status: "confirmed", daysAgo: 28 },

    // ── Current month: More activity + pending + retail sales ──
    { sellerId: IDS.confiance, buyerId: IDS.gatete, productId: IDS.cement,     quantity: 200, unitPrice: 2500, status: "confirmed", daysAgo: 12 },
    { sellerId: IDS.confiance, buyerId: IDS.niyonzima, productId: IDS.soap,    quantity: 300, unitPrice: 500,  status: "pending",   daysAgo: 5 },
    { sellerId: IDS.gatete,   buyerId: IDS.uwimana, productId: IDS.rice,       quantity: 200, unitPrice: 1100, status: "pending",   daysAgo: 3 },

    // Retail to consumer
    { sellerId: IDS.uwimana, buyerId: null, buyerName: "Jean Claude Habimana", productId: IDS.soap,  quantity: 50,  unitPrice: 1000, status: "completed", daysAgo: 20 },
    { sellerId: IDS.uwimana, buyerId: null, buyerName: "Alice Mukeshimana",    productId: IDS.sugar, quantity: 80,  unitPrice: 2000, status: "completed", daysAgo: 15 },
    { sellerId: IDS.diane,   buyerId: null, buyerName: "Peter Mugabo",         productId: IDS.cookingOil, quantity: 30, unitPrice: 2500, status: "completed", daysAgo: 8 },
];

// ── Tax Payments — partial payments from traders ────────────────────────────

interface PaymentDef {
    businessId: string;
    amount: number;
    method: string;
    daysAgo: number;
}

const TAX_PAYMENTS: PaymentDef[] = [
    // Confiance pays ~70% of VAT owed
    { businessId: IDS.confiance, amount: 120_000, method: "bank_transfer", daysAgo: 40 },
    { businessId: IDS.confiance, amount: 85_000,  method: "mobile_money",  daysAgo: 15 },
    // Gatete pays ~60%
    { businessId: IDS.gatete,    amount: 45_000,  method: "mobile_money",  daysAgo: 25 },
    // Uwimana pays ~50%
    { businessId: IDS.uwimana,   amount: 15_000,  method: "mobile_money",  daysAgo: 10 },
];

// ---------------------------------------------------------------------------
// Main seed logic
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
    console.log("🧹 CLEAN RESEED — Clearing all non-auth data...\n");

    // ── 1. Delete everything in FK order ───────────────────────────────────

    // Tables with FK to transaction
    await db.delete(dispute);
    await db.delete(vatRecord);
    console.log("  ✓ Cleared disputes, vat_record");

    // Tables with FK to product
    await db.delete(importDeclaration);
    console.log("  ✓ Cleared import_declaration");

    // Transaction itself (FK to user + product)
    await db.delete(transaction);
    console.log("  ✓ Cleared transaction");

    // Stock (FK to user + product)
    await db.delete(stock);
    console.log("  ✓ Cleared stock");

    // Product (FK to user)
    await db.delete(product);
    console.log("  ✓ Cleared product");

    // Tax payment, audit log, notification (FK to user only)
    await db.delete(taxPayment);
    await db.delete(auditLog);
    await db.delete(notification);
    console.log("  ✓ Cleared tax_payment, audit_log, notification");

    // Staff bulletin, support ticket, system config
    await db.delete(staffBulletin);
    await db.delete(supportTicket);
    await db.delete(systemConfig);
    console.log("  ✓ Cleared staff_bulletin, support_ticket, system_config");

    // Delete all NON-staff users (traders) — keep rra_staff users and their accounts
    // First find all non-rra_staff users
    const traderEmails = TRADERS.map((t) => t.email);
    const traderTins = TRADERS.map((t) => t.tinNumber);
    const traderPhones = TRADERS.map((t) => t.phone);
    const traderMatch = or(
        inArray(user.email, traderEmails),
        inArray(user.tinNumber, traderTins),
        inArray(user.phoneNumber, traderPhones),
    )!;

    // Delete old trader accounts (but leave rra_staff accounts untouched)
    // We also need to delete any non-staff non-seed trader users
    const nonStaffUsers = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`${user.role} != 'rra_staff'`);

    if (nonStaffUsers.length > 0) {
        const nonStaffIds = nonStaffUsers.map((u) => u.id);
        await db.delete(account).where(inArray(account.userId, nonStaffIds));
        await db.delete(user).where(inArray(user.id, nonStaffIds));
        console.log(`  ✓ Removed ${nonStaffIds.length} non-staff user(s)\n`);
    } else {
        console.log("  ✓ No non-staff users to remove\n");
    }

    // ── 2. Insert traders ──────────────────────────────────────────────────

    const hashedPassword = await hashPassword(SEED_PASSWORD);
    console.log("  👥 Creating traders...");

    for (const t of TRADERS) {
        await db.insert(user).values({
            id: t.id,
            name: t.name,
            username: t.tinNumber,
            displayUsername: t.tinNumber,
            email: t.email,
            phoneNumber: t.phone,
            phoneNumberVerified: true,
            nationalId: t.nationalId,
            tinNumber: t.tinNumber,
            businessName: t.businessName,
            role: t.role,
            clearanceStatus: t.clearanceStatus,
            emailVerified: true,
            isActive: true,
        });

        await db.insert(account).values({
            id: crypto.randomUUID(),
            accountId: t.id,
            providerId: "credential",
            userId: t.id,
            password: hashedPassword,
        });

        console.log(`     ✓ ${t.businessName} (${t.role}) — TIN: ${t.tinNumber}`);
    }

    // ── 3. Insert products (created by Confiance) ──────────────────────────

    console.log("\n  📦 Creating products...");
    for (const p of PRODUCTS) {
        await db.insert(product).values({
            id: p.id,
            name: p.name,
            unit: p.unit,
            categoryCode: p.categoryCode,
            createdByUserId: IDS.confiance,
        });
    }
    console.log(`     ✓ ${PRODUCTS.length} products created`);

    // ── 4. Insert Confiance stock only ──────────────────────────────────────

    console.log("\n  🏭 Setting Confiance stock...");
    for (const [productId, { qty, price }] of Object.entries(CONFIANCE_STOCK)) {
        await db.insert(stock).values({
            id: crypto.randomUUID(),
            businessId: IDS.confiance,
            productId,
            quantity: qty,
            price,
            source: "manufactured",
        });
    }
    console.log(`     ✓ ${Object.keys(CONFIANCE_STOCK).length} stock entries for Confiance`);

    // ── 5. Process transactions, VAT, and stock adjustments ─────────────────

    console.log("\n  💰 Creating transactions...");
    const auditEntries: Array<{
        userId: string;
        action: string;
        targetType: string;
        targetId: string;
        metadata: string;
        createdAt: Date;
    }> = [];

    // Track stock adjustments from confirmed transactions
    const stockAdjust: Record<string, Record<string, number>> = {};

    for (const txn of TRANSACTIONS) {
        const totalAmount = txn.quantity * txn.unitPrice;
        const vatAmount = Math.round(totalAmount * VAT_RATE);
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - txn.daysAgo);
        const confirmedAt = (txn.status === "confirmed" || txn.status === "completed")
            ? new Date(createdAt.getTime() + 86_400_000)
            : null;

        const txnId = crypto.randomUUID();

        await db.insert(transaction).values({
            id: txnId,
            sellerId: txn.sellerId,
            buyerId: txn.buyerId,
            buyerName: txn.buyerName ?? null,
            productId: txn.productId,
            quantity: txn.quantity,
            unitPrice: txn.unitPrice,
            totalAmount,
            vatAmount,
            status: txn.status,
            createdAt,
            confirmedAt,
        });

        auditEntries.push({
            userId: txn.sellerId,
            action: "TRANSACTION_CREATED",
            targetType: "transaction",
            targetId: txnId,
            metadata: JSON.stringify({ buyerId: txn.buyerId, quantity: txn.quantity, totalAmount }),
            createdAt,
        });

        if (txn.status === "confirmed" || txn.status === "completed") {
            // VAT output (seller)
            await db.insert(vatRecord).values({
                id: crypto.randomUUID(),
                transactionId: txnId,
                businessId: txn.sellerId,
                vatType: "output",
                amount: vatAmount,
                createdAt: confirmedAt!,
            });

            // VAT input (buyer, B2B only)
            if (txn.buyerId) {
                await db.insert(vatRecord).values({
                    id: crypto.randomUUID(),
                    transactionId: txnId,
                    businessId: txn.buyerId,
                    vatType: "input",
                    amount: vatAmount,
                    createdAt: confirmedAt!,
                });
            }

            // Stock adjustments
            if (!stockAdjust[txn.sellerId]) stockAdjust[txn.sellerId] = {};
            stockAdjust[txn.sellerId][txn.productId] =
                (stockAdjust[txn.sellerId][txn.productId] ?? 0) - txn.quantity;

            if (txn.buyerId) {
                if (!stockAdjust[txn.buyerId]) stockAdjust[txn.buyerId] = {};
                stockAdjust[txn.buyerId][txn.productId] =
                    (stockAdjust[txn.buyerId][txn.productId] ?? 0) + txn.quantity;
            }

            auditEntries.push({
                userId: txn.buyerId ?? txn.sellerId,
                action: txn.status === "completed" ? "RETAIL_SALE_COMPLETED" : "TRANSACTION_CONFIRMED",
                targetType: "transaction",
                targetId: txnId,
                metadata: JSON.stringify({ quantity: txn.quantity, vatAmount }),
                createdAt: confirmedAt!,
            });
        }

        const buyer = txn.buyerName ?? TRADERS.find((t) => t.id === txn.buyerId)?.businessName ?? "Unknown";
        const seller = TRADERS.find((t) => t.id === txn.sellerId)?.businessName ?? "Unknown";
        console.log(`     ✓ ${seller} → ${buyer} | ${txn.quantity} × ${txn.unitPrice} = ${totalAmount.toLocaleString()} RWF [${txn.status}]`);
    }

    // Apply stock adjustments to Confiance's stock (deductions from sales)
    for (const [businessId, products] of Object.entries(stockAdjust)) {
        if (businessId === IDS.confiance) {
            // Update existing stock
            for (const [productId, delta] of Object.entries(products)) {
                const existing = CONFIANCE_STOCK[productId];
                if (existing) {
                    const newQty = existing.qty + delta;
                    await db.update(stock)
                        .set({ quantity: Math.max(0, newQty) })
                        .where(sql`${stock.businessId} = ${businessId} AND ${stock.productId} = ${productId}`);
                }
            }
        } else {
            // Create stock for buyers (Gatete, Uwimana, etc.) from confirmed purchases
            for (const [productId, qty] of Object.entries(products)) {
                if (qty > 0) {
                    await db.insert(stock).values({
                        id: crypto.randomUUID(),
                        businessId,
                        productId,
                        quantity: qty,
                        source: "purchased",
                    }).onConflictDoNothing();
                }
            }
        }
    }

    // ── 6. Tax payments ─────────────────────────────────────────────────────

    console.log("\n  💳 Creating tax payments...");
    for (const p of TAX_PAYMENTS) {
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - p.daysAgo);

        await db.insert(taxPayment).values({
            id: crypto.randomUUID(),
            businessId: p.businessId,
            amount: p.amount,
            method: p.method,
            reference: `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            status: "confirmed",
            createdAt,
        });

        const trader = TRADERS.find((t) => t.id === p.businessId)!;
        console.log(`     ✓ ${trader.businessName} paid ${p.amount.toLocaleString()} RWF via ${p.method}`);
    }

    // ── 7. Production audit entries ─────────────────────────────────────────

    console.log("\n  🏭 Recording production...");
    const productEntries = Object.entries(CONFIANCE_STOCK);
    for (let i = 0; i < productEntries.length; i++) {
        const [productId, { qty }] = productEntries[i];
        const date = new Date();
        date.setDate(date.getDate() - (i < 3 ? 50 : 20)); // spread across months

        auditEntries.push({
            userId: IDS.confiance,
            action: "PRODUCTION_RECORDED",
            targetType: "product",
            targetId: productId,
            metadata: JSON.stringify({ quantity: qty }),
            createdAt: new Date(date),
        });
    }

    // ── 8. Write audit log ──────────────────────────────────────────────────

    console.log("\n  📋 Writing audit log...");
    for (const entry of auditEntries) {
        await db.insert(auditLog).values({
            id: crypto.randomUUID(),
            ...entry,
        });
    }
    console.log(`     ✓ ${auditEntries.length} audit entries created`);

    // ── Summary ─────────────────────────────────────────────────────────────

    console.log("\n✅ Clean reseed complete!\n");
    console.log("  ┌──────────────────────────────┬──────────────┬──────────────┬──────────────┐");
    console.log("  │ Business                     │ Role         │ TIN          │ Status       │");
    console.log("  ├──────────────────────────────┼──────────────┼──────────────┼──────────────┤");
    for (const t of TRADERS) {
        console.log(
            `  │ ${t.businessName.padEnd(28)} │ ${t.role.padEnd(12)} │ ${t.tinNumber.padEnd(12)} │ ${t.clearanceStatus.padEnd(12)} │`,
        );
    }
    console.log("  └──────────────────────────────┴──────────────┴──────────────┴──────────────┘\n");

    console.log("  📊 Data Summary:");
    console.log(`     Traders:      ${TRADERS.length}`);
    console.log(`     Products:     ${PRODUCTS.length}`);
    console.log(`     Transactions: ${TRANSACTIONS.length}`);
    console.log(`     Tax Payments: ${TAX_PAYMENTS.length}`);
    console.log(`     Audit Logs:   ${auditEntries.length}\n`);

    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
