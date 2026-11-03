import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as tinSchema from "./tin-schema";

const tinConnectionString = process.env.TIN_DATABASE_URL;

// Fail gracefully at query time instead of crashing at module import time
// when TIN_DATABASE_URL is not configured.
const tinClient = tinConnectionString
  ? postgres(tinConnectionString)
  : postgres("postgresql://placeholder:placeholder@localhost:5432/placeholder", {
      max: 0, // no connections — queries will fail at runtime, not at import
    });

// Keep query/parameter logging out of production logs; TIN-related lookups
// can include sensitive business identifiers in bound parameters.
export const tinDb = drizzle(tinClient, {
  schema: tinSchema,
  logger: process.env.NODE_ENV !== 'production',
});
export default tinDb;
