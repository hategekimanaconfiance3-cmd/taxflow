import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// TIN Database Schema
// Simulates the government (RRA) citizen/business registry.
// Read-only from the app's perspective — seeded with mock data.
// ---------------------------------------------------------------------------

export const citizen = pgTable(
    "citizen",
    {
        id: text("id").primaryKey(),
        nationalId: text("national_id").notNull().unique(),
        firstName: text("first_name").notNull(),
        lastName: text("last_name").notNull(),
        dateOfBirth: text("date_of_birth"),
        gender: text("gender"), // M or F
        province: text("province"),
        district: text("district"),
        sector: text("sector"),
        cell: text("cell"),
        village: text("village"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [index("citizen_national_id_idx").on(table.nationalId)],
);

export const tinRecord = pgTable(
    "tin_record",
    {
        id: text("id").primaryKey(),
        tinNumber: text("tin_number").notNull().unique(),
        nationalId: text("national_id")
            .notNull()
            .references(() => citizen.nationalId, { onDelete: "cascade" }),
        businessName: text("business_name").notNull(),
        businessType: text("business_type"), // manufacturer, wholesaler, retailer
        phone: text("phone").notNull(),
        email: text("email"),
        address: text("address"),
        province: text("province"),
        district: text("district"),
        sector: text("sector"),
        cell: text("cell"),
        village: text("village"),
        isActive: boolean("is_active").notNull().default(true),
        registeredAt: timestamp("registered_at").defaultNow().notNull(),
    },
    (table) => [
        index("tin_record_tin_number_idx").on(table.tinNumber),
        index("tin_record_national_id_idx").on(table.nationalId),
    ],
);
