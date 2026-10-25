import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface ProvincePoint {
    province: string;
    vatCollected: number;
    taxPaid: number;
    traderCount: number;
    compliancePct: number;
}

export interface ProvinceTaxData {
    provinces: ProvincePoint[];
    topProvince: string | null;
    totalVat: number;
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return new Response("Unauthorized", { status: 401 });

    console.info("[province-tax] Province attribution is unavailable: taxpayer records do not store province.");
    return Response.json(
        { error: "Province tax analytics are unavailable because taxpayer records do not include province data." },
        { status: 501 },
    );
}
