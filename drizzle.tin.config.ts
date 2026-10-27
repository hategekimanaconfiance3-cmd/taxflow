import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import type { Config } from "drizzle-kit";

export default defineConfig({
    schema: "./db/tin-schema.ts",
    out: "./db/migrations/tin",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.TIN_DATABASE_URL!,
    },
    verbose: true,
    strict: true,
    migrations: {
        table: "drizzle_migrations",
        schema: "public",
    },
} satisfies Config);
