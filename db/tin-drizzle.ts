import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as tinSchema from "./tin-schema";

const tinClient = postgres(process.env.TIN_DATABASE_URL!);
// Keep query/parameter logging out of production logs; TIN-related lookups
// can include sensitive business identifiers in bound parameters.
export const tinDb = drizzle(tinClient, {
  schema: tinSchema,
  logger: process.env.NODE_ENV !== 'production',
});
export default tinDb;
