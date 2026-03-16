import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as tinSchema from "./tin-schema";

const tinClient = postgres(process.env.TIN_DATABASE_URL!);
export const tinDb = drizzle(tinClient, { schema: tinSchema, logger: true });
export default tinDb;
