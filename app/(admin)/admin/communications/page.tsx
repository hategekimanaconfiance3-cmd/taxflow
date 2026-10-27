import { getAdminCommunicationsPageData, getCommunicationAdminDirectory } from "@/lib/actions/admin-communications.action";
import { requireRRAPermission } from "@/lib/auth-guard";
import { CommunicationsCenter } from "@/components/admin/communications-center";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminCommunicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRRAPermission("communications.read");
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  let data: Awaited<ReturnType<typeof getAdminCommunicationsPageData>> | null = null;
  let recipients: Awaited<ReturnType<typeof getCommunicationAdminDirectory>> = [];
  let failed = false;
  try {
    data = await getAdminCommunicationsPageData({
      query: first(params.query),
      page: first(params.page),
      conversationId: first(params.conversationId),
      messagePage: first(params.messagePage),
    });
    recipients = data.canSend ? await getCommunicationAdminDirectory() : [];
  } catch (error) {
    console.error("Admin communications page could not load", { errorName: error instanceof Error ? error.name : typeof error });
    failed = true;
  }
  if (failed || !data) return <main className="space-y-4"><header><h1 className="text-2xl font-semibold">Communications</h1><p className="text-sm text-muted-foreground">Staff messages and broadcasts.</p></header><Card className="border-destructive/40"><CardContent className="py-6 text-sm text-destructive" role="alert">Communications are temporarily unavailable. Refresh the page or contact your system administrator if this continues.</CardContent></Card></main>;
  return <CommunicationsCenter data={data} recipients={recipients} />;
}
