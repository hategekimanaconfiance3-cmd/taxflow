import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, or } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
    user,
    account,
    product,
    stock,
    transaction,
    vatRecord,
    auditLog,
} from "../schema";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// TaxFlow Supply Chain Seed — Traders, Products, Transactions, VAT
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

// ── Stable IDs ──────────────────────────────────────────────────────────────

const IDS = {
    // Traders
    confiance: crypto.randomUUID(), // manufacturer
    gatete: crypto.randomUUID(), // wholesaler
    uwimana: crypto.randomUUID(), // retailer
    niyonzima: crypto.randomUUID(), // wholesaler (under_review)
    diane: crypto.randomUUID(), // retailer

    // Products
    soap: crypto.randomUUID(),
    sugar: crypto.randomUUID(),
    rice: crypto.randomUUID(),
    cement: crypto.randomUUID(),
    paint: crypto.randomUUID(),
    fabric: crypto.randomUUID(),
    shoes: crypto.randomUUID(),
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
    { id: IDS.soap, name: "Soap", unit: "unit", categoryCode: "FMCG-001" },
    { id: IDS.sugar, name: "Sugar", unit: "kg", categoryCode: "FOOD-001" },
    { id: IDS.rice, name: "Rice", unit: "kg", categoryCode: "FOOD-002" },
    { id: IDS.cement, name: "Cement", unit: "kg", categoryCode: "CONST-001" },
    { id: IDS.paint, name: "Paint", unit: "liter", categoryCode: "CONST-002" },
    { id: IDS.fabric, name: "Fabric", unit: "meter", categoryCode: "TEXT-001" },
    { id: IDS.shoes, name: "Shoes", unit: "pair", categoryCode: "TEXT-002" },
    {
        id: IDS.cookingOil,
        name: "Cooking Oil",
        unit: "liter",
        categoryCode: "FOOD-003",
    },
];

// ── Initial Manufacturer Stock (production) ─────────────────────────────────

const INITIAL_STOCK: Record<string, number> = {
    [IDS.soap]: 5000,
    [IDS.sugar]: 3000,
    [IDS.rice]: 4500,
    [IDS.cement]: 2000,
    [IDS.paint]: 1500,
    [IDS.fabric]: 800,
    [IDS.shoes]: 600,
    [IDS.cookingOil]: 2500,
};

// ── Transaction Definitions ─────────────────────────────────────────────────

interface TxnDef {
    sellerId: string;
    buyerId: string | null;
    buyerName?: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    status: "pending" | "confirmed" | "completed" | "rejected";
    daysAgo: number; // how many days ago was this created
}

const TRANSACTIONS: TxnDef[] = [
    // Manufacturer → Wholesaler (Gatete) — mostly confirmed
    {
        sellerId: IDS.confiance,
        buyerId: IDS.gatete,
        productId: IDS.soap,
        quantity: 500,
        unitPrice: 500,
        status: "confirmed",
        daysAgo: 45,
    },
    {
        sellerId: IDS.confiance,
        buyerId: IDS.gatete,
        productId: IDS.sugar,
        quantity: 1200,
        unitPrice: 1000,
        status: "confirmed",
        daysAgo: 38,
    },
    {
        sellerId: IDS.confiance,
        buyerId: IDS.gatete,
        productId: IDS.rice,
        quantity: 1000,
        unitPrice: 800,
        status: "completed",
        daysAgo: 30,
    },
    {
        sellerId: IDS.confiance,
        buyerId: IDS.gatete,
        productId: IDS.cement,
        quantity: 300,
        unitPrice: 2500,
        status: "pending",
        daysAgo: 5,
    },
    // Manufacturer → Wholesaler (Niyonzima) — pending (under_review)
    {
        sellerId: IDS.confiance,
        buyerId: IDS.niyonzima,
        productId: IDS.soap,
        quantity: 300,
        unitPrice: 500,
        status: "pending",
        daysAgo: 3,
    },
    // Manufacturer → Retailer (Diane) — direct sale confirmed
    {
        sellerId: IDS.confiance,
        buyerId: IDS.diane,
        productId: IDS.paint,
        quantity: 200,
        unitPrice: 1200,
        status: "confirmed",
        daysAgo: 20,
    },
    // Wholesaler (Gatete) → Retailer (Uwimana) — reselling
    {
        sellerId: IDS.gatete,
        buyerId: IDS.uwimana,
        productId: IDS.soap,
        quantity: 200,
        unitPrice: 700,
        status: "confirmed",
        daysAgo: 25,
    },
    {
        sellerId: IDS.gatete,
        buyerId: IDS.uwimana,
        productId: IDS.sugar,
        quantity: 500,
        unitPrice: 1400,
        status: "confirmed",
        daysAgo: 18,
    },
    {
        sellerId: IDS.gatete,
        buyerId: IDS.uwimana,
        productId: IDS.rice,
        quantity: 400,
        unitPrice: 1100,
        status: "pending",
        daysAgo: 2,
    },
    // Retailer (Uwimana) → Consumer — retail sales
    {
        sellerId: IDS.uwimana,
        buyerId: null,
        buyerName: "Jean Claude Habimana",
        productId: IDS.soap,
        quantity: 50,
        unitPrice: 1000,
        status: "completed",
        daysAgo: 15,
    },
    {
        sellerId: IDS.uwimana,
        buyerId: null,
        buyerName: "Alice Mukeshimana",
        productId: IDS.sugar,
        quantity: 100,
        unitPrice: 2000,
        status: "completed",
        daysAgo: 10,
    },
];

// ── Seed Logic ──────────────────────────────────────────────────────────────

async function seed() {
    console.log("🌱 Seeding TaxFlow supply chain data...\n");

    const hashedPassword = await hashPassword(SEED_PASSWORD);

    // ── 1. Clean existing supply chain data (reverse FK order) ──────────

    console.log("  🗑  Clearing existing supply chain data...");
    await db.delete(auditLog);
    await db.delete(vatRecord);
    await db.delete(transaction);
    await db.delete(stock);
    await db.delete(product);

    // Delete trader accounts AND user rows (by email, TIN, or phone — catch all)
    const traderEmails = TRADERS.map((t) => t.email);
    const traderTins = TRADERS.map((t) => t.tinNumber);
    const traderPhones = TRADERS.map((t) => t.phone);

    const traderMatch = or(
        inArray(user.email, traderEmails),
        inArray(user.tinNumber, traderTins),
        inArray(user.phoneNumber, traderPhones),
    )!;

    // First delete accounts referencing these users
    await db.delete(account).where(
        inArray(
            account.userId,
            db.select({ id: user.id }).from(user).where(traderMatch),
        ),
    );
    // Then delete the users themselves
    await db.delete(user).where(traderMatch);

    console.log("  ✓ Cleared\n");

    // ── 2. Insert Traders ───────────────────────────────────────────────

    console.log("  👥 Creating traders...");
    for (const trader of TRADERS) {
        await db
            .insert(user)
            .values({
                id: trader.id,
                name: trader.name,
                username: trader.tinNumber,
                displayUsername: trader.tinNumber,
                email: trader.email,
                phoneNumber: trader.phone,
                phoneNumberVerified: true,
                nationalId: trader.nationalId,
                tinNumber: trader.tinNumber,
                businessName: trader.businessName,
                role: trader.role,
                clearanceStatus: trader.clearanceStatus,
                emailVerified: true,
                isActive: true,
            })
            .onConflictDoUpdate({
                target: user.email,
                set: {
                    name: trader.name,
                    username: trader.tinNumber,
                    displayUsername: trader.tinNumber,
                    phoneNumber: trader.phone,
                    nationalId: trader.nationalId,
                    tinNumber: trader.tinNumber,
                    businessName: trader.businessName,
                    role: trader.role,
                    clearanceStatus: trader.clearanceStatus,
                },
            });

        // Better Auth credential account
        await db
            .insert(account)
            .values({
                id: crypto.randomUUID(),
                accountId: trader.id,
                providerId: "credential",
                userId: trader.id,
                password: hashedPassword,
            })
            .onConflictDoNothing();

        console.log(
            `     ✓ ${trader.businessName} (${trader.role}) — TIN: ${trader.tinNumber}`,
        );
    }

    // ── 3. Insert Products ──────────────────────────────────────────────

    console.log("\n  📦 Creating products...");
    for (const prod of PRODUCTS) {
        await db
            .insert(product)
            .values({
                id: prod.id,
                name: prod.name,
                unit: prod.unit,
                categoryCode: prod.categoryCode,
                createdByUserId: IDS.confiance, // manufacturer creates all
            })
            .onConflictDoNothing();
    }
    console.log(`     ✓ ${PRODUCTS.length} products created`);

    // ── 4. Set initial manufacturer stock ────────────────────────────────

    console.log("\n  🏭 Setting initial manufacturer stock...");
    // Track stock balances (will be adjusted by transactions)
    const stockBalances: Record<string, Record<string, number>> = {};

    // Initialize manufacturer stock
    stockBalances[IDS.confiance] = { ...INITIAL_STOCK };

    // Add PRODUCTION_RECORDED audit entries so production chart shows data
    // Split across previous month and current month for both bars
    const prevMonthDate = new Date();
    prevMonthDate.setDate(prevMonthDate.getDate() - 14); // ~mid previous month
    const currentMonthDate = new Date(); // today = current month

    const auditEntries: Array<{
        userId: string;
        action: string;
        targetType: string;
        targetId: string;
        metadata: string;
        createdAt?: Date;
    }> = [];

    const productEntries = Object.entries(INITIAL_STOCK);
    for (let i = 0; i < productEntries.length; i++) {
        const [productId, qty] = productEntries[i];
        // First 5 products → previous month, last 3 → current month
        const date = i < 5 ? prevMonthDate : currentMonthDate;
        auditEntries.push({
            userId: IDS.confiance,
            action: "PRODUCTION_RECORDED",
            targetType: "product",
            targetId: productId,
            metadata: JSON.stringify({ quantity: qty }),
            createdAt: new Date(date),
        });
    }

    // ── 5. Process transactions ─────────────────────────────────────────

    console.log("\n  💰 Creating transactions...");

    for (const txnDef of TRANSACTIONS) {
        const totalAmount = txnDef.quantity * txnDef.unitPrice;
        const vatAmount = Math.round(totalAmount * VAT_RATE);
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - txnDef.daysAgo);
        const confirmedAt =
            txnDef.status === "confirmed" || txnDef.status === "completed"
                ? new Date(createdAt.getTime() + 86400000) // confirmed 1 day later
                : null;

        const txnId = crypto.randomUUID();

        await db.insert(transaction).values({
            id: txnId,
            sellerId: txnDef.sellerId,
            buyerId: txnDef.buyerId,
            buyerName: txnDef.buyerName ?? null,
            productId: txnDef.productId,
            quantity: txnDef.quantity,
            unitPrice: txnDef.unitPrice,
            totalAmount,
            vatAmount,
            status: txnDef.status,
            createdAt,
            confirmedAt,
        });

        // Audit: transaction created
        auditEntries.push({
            userId: txnDef.sellerId,
            action: "TRANSACTION_CREATED",
            targetType: "transaction",
            targetId: txnId,
            metadata: JSON.stringify({
                buyerId: txnDef.buyerId,
                quantity: txnDef.quantity,
                totalAmount,
            }),
        });

        // If confirmed/completed, process stock and VAT
        if (
            txnDef.status === "confirmed" ||
            txnDef.status === "completed"
        ) {
            // Deduct seller stock
            if (!stockBalances[txnDef.sellerId]) {
                stockBalances[txnDef.sellerId] = {};
            }
            stockBalances[txnDef.sellerId][txnDef.productId] =
                (stockBalances[txnDef.sellerId][txnDef.productId] ?? 0) -
                txnDef.quantity;

            // Add buyer stock (only for B2B)
            if (txnDef.buyerId) {
                if (!stockBalances[txnDef.buyerId]) {
                    stockBalances[txnDef.buyerId] = {};
                }
                stockBalances[txnDef.buyerId][txnDef.productId] =
                    (stockBalances[txnDef.buyerId][txnDef.productId] ?? 0) +
                    txnDef.quantity;
            }

            // VAT output (seller)
            await db.insert(vatRecord).values({
                id: crypto.randomUUID(),
                transactionId: txnId,
                businessId: txnDef.sellerId,
                vatType: "output",
                amount: vatAmount,
                createdAt: confirmedAt!,
            });

            // VAT input (buyer) — B2B only
            if (txnDef.buyerId) {
                await db.insert(vatRecord).values({
                    id: crypto.randomUUID(),
                    transactionId: txnId,
                    businessId: txnDef.buyerId,
                    vatType: "input",
                    amount: vatAmount,
                    createdAt: confirmedAt!,
                });
            }

            // Audit: confirmed
            auditEntries.push({
                userId: txnDef.buyerId ?? txnDef.sellerId,
                action:
                    txnDef.status === "completed"
                        ? "RETAIL_SALE_COMPLETED"
                        : "TRANSACTION_CONFIRMED",
                targetType: "transaction",
                targetId: txnId,
                metadata: JSON.stringify({
                    quantity: txnDef.quantity,
                    vatAmount,
                }),
            });
        }

        const buyerLabel =
            txnDef.buyerName ??
            TRADERS.find((t) => t.id === txnDef.buyerId)?.businessName ??
            "Unknown";
        const sellerLabel =
            TRADERS.find((t) => t.id === txnDef.sellerId)?.businessName ??
            "Unknown";
        console.log(
            `     ✓ ${sellerLabel} → ${buyerLabel} | ${txnDef.quantity} × ${txnDef.unitPrice} = ${totalAmount.toLocaleString()} RWF [${txnDef.status}]`,
        );
    }

    // ── 6. Write final stock balances ───────────────────────────────────

    console.log("\n  📊 Writing stock balances...");
    for (const [businessId, products] of Object.entries(stockBalances)) {
        for (const [productId, quantity] of Object.entries(products)) {
            if (quantity <= 0) continue; // skip zero/negative
            await db.insert(stock).values({
                id: crypto.randomUUID(),
                businessId,
                productId,
                quantity,
            });
        }
    }

    // Count stock entries
    const stockCount = Object.values(stockBalances).reduce(
        (sum, products) =>
            sum +
            Object.values(products).filter((q) => q > 0).length,
        0,
    );
    console.log(`     ✓ ${stockCount} stock entries created`);

    // ── 7. Write audit log ──────────────────────────────────────────────

    console.log("\n  📋 Writing audit log...");
    for (const entry of auditEntries) {
        await db.insert(auditLog).values({
            id: crypto.randomUUID(),
            ...entry,
        });
    }
    console.log(`     ✓ ${auditEntries.length} audit entries created`);

    // ── Summary ─────────────────────────────────────────────────────────

    console.log("\n✅ Supply chain seed complete!\n");
    console.log("  📋 Login Credentials (all traders):");
    console.log("");
    for (const trader of TRADERS) {
        console.log(
            `     ${trader.businessName.padEnd(25)} Phone: ${trader.phone}  TIN: ${trader.tinNumber}  [${trader.role}]`,
        );
    }
    console.log("");

    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
