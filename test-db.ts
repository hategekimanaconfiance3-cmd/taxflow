import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./db/drizzle";
import { tinDb } from "./db/tin-drizzle";

async function testConnections() {
  console.log("Testing Taxflow Database Connection...");
  try {
    const result = await db.execute(sql`SELECT current_database(), current_user, version()`);
    console.log("✅ Taxflow DB Connected!");
    console.log(result);
  } catch (error) {
    console.error("❌ Taxflow DB Connection Failed:", error);
  }

  console.log("\nTesting TIN Database Connection...");
  try {
    const result = await tinDb.execute(sql`SELECT current_database(), current_user, version()`);
    console.log("✅ TIN DB Connected!");
    console.log(result);
  } catch (error) {
    console.error("❌ TIN DB Connection Failed:", error);
  }
}

testConnections();
