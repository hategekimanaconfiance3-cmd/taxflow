import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { citizen, tinRecord } from "../tin-schema";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// TIN Database Seed — Mock Government Registry
// All citizens & businesses include Rwanda's 5-level geo-tagging:
// Province → District → Sector → Cell → Village
// ---------------------------------------------------------------------------

const client = postgres(process.env.TIN_DATABASE_URL!);
const db = drizzle(client);

const CITIZENS = [
    {
        id: crypto.randomUUID(),
        nationalId: "1199880012345678",
        firstName: "Confiance",
        lastName: "Hategekimana",
        dateOfBirth: "1998-05-15",
        gender: "M",
        province: "Kigali City",
        district: "Gasabo",
        sector: "Kimironko",
        cell: "Kibagabaga",
        village: "Nyagatovu",
    },
    {
        id: crypto.randomUUID(),
        nationalId: "1199570087654321",
        firstName: "Elias",
        lastName: "Gatete",
        dateOfBirth: "1997-08-22",
        gender: "M",
        province: "Kigali City",
        district: "Kicukiro",
        sector: "Gatenga",
        cell: "Nyabisindu",
        village: "Rebero",
    },
    {
        id: crypto.randomUUID(),
        nationalId: "1200190056781234",
        firstName: "Marie",
        lastName: "Uwimana",
        dateOfBirth: "2001-03-10",
        gender: "F",
        province: "Southern Province",
        district: "Huye",
        sector: "Ngoma",
        cell: "Huye",
        village: "Butare",
    },
    {
        id: crypto.randomUUID(),
        nationalId: "1198560043219876",
        firstName: "Jean Pierre",
        lastName: "Niyonzima",
        dateOfBirth: "1985-11-28",
        gender: "M",
        province: "Eastern Province",
        district: "Rwamagana",
        sector: "Muhazi",
        cell: "Kabare",
        village: "Rwimiyaga",
    },
    {
        id: crypto.randomUUID(),
        nationalId: "1199290078563412",
        firstName: "Diane",
        lastName: "Mukamana",
        dateOfBirth: "1992-07-04",
        gender: "F",
        province: "Western Province",
        district: "Rubavu",
        sector: "Gisenyi",
        cell: "Nengo",
        village: "Amahoro",
    },
];

const TIN_RECORDS = [
    {
        id: crypto.randomUUID(),
        tinNumber: "100456789",
        nationalId: "1199880012345678",
        businessName: "Confiance Construction Ltd.",
        businessType: "manufacturer",
        phone: "+250788000001",
        email: "confiance@construction.rw",
        address: "KG 123 St, Kimironko, Kigali",
        province: "Kigali City",
        district: "Gasabo",
        sector: "Kimironko",
        cell: "Kibagabaga",
        village: "Nyagatovu",
    },
    {
        id: crypto.randomUUID(),
        tinNumber: "100789456",
        nationalId: "1199570087654321",
        businessName: "Gatete Trading Co.",
        businessType: "wholesaler",
        phone: "+250788000002",
        email: "elllyers@gmail.com",
        address: "KK 45 Ave, Gatenga, Kigali",
        province: "Kigali City",
        district: "Kicukiro",
        sector: "Gatenga",
        cell: "Nyabisindu",
        village: "Rebero",
    },
    {
        id: crypto.randomUUID(),
        tinNumber: "100321654",
        nationalId: "1200190056781234",
        businessName: "Uwimana General Store",
        businessType: "retailer",
        phone: "+250788000003",
        email: "marie@uwimana.rw",
        address: "Ngoma, Huye",
        province: "Southern Province",
        district: "Huye",
        sector: "Ngoma",
        cell: "Huye",
        village: "Butare",
    },
    {
        id: crypto.randomUUID(),
        tinNumber: "100654987",
        nationalId: "1198560043219876",
        businessName: "Niyonzima Wholesale",
        businessType: "wholesaler",
        phone: "+250788000004",
        email: "jpniyonzima@gmail.com",
        address: "Muhazi, Rwamagana",
        province: "Eastern Province",
        district: "Rwamagana",
        sector: "Muhazi",
        cell: "Kabare",
        village: "Rwimiyaga",
    },
    {
        id: crypto.randomUUID(),
        tinNumber: "100987321",
        nationalId: "1199290078563412",
        businessName: "Diane Fashion & Retail",
        businessType: "retailer",
        phone: "+250788000005",
        email: "diane@mukamana.rw",
        address: "Gisenyi, Rubavu",
        province: "Western Province",
        district: "Rubavu",
        sector: "Gisenyi",
        cell: "Nengo",
        village: "Amahoro",
    },
];

async function seed() {
    console.log("🌱 Seeding TIN database...");

    // Clear existing data
    await db.delete(tinRecord);
    await db.delete(citizen);

    // Insert citizens
    await db.insert(citizen).values(CITIZENS);
    console.log(`  ✓ Inserted ${CITIZENS.length} citizens`);

    // Insert TIN records
    await db.insert(tinRecord).values(TIN_RECORDS);
    console.log(`  ✓ Inserted ${TIN_RECORDS.length} TIN records`);

    console.log("✅ TIN database seeded successfully!");
    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
