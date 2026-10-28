import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface ProvinceTaxData {
  available: false;
  reason: string;
}

export async function GET(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // The current user schema has no province/address field. Do not infer a
  // geographic location or report fabricated provincial tax totals.
  return Response.json({
    available: false,
    reason: "TaxFlow does not currently record a verified province for each business.",
  } satisfies ProvinceTaxData);
}
