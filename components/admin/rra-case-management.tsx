"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Clock3, Loader2, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createRraCase, getRraCaseDetails, requestTaxpayerInformation, updateRraCase, type RraCaseStatus } from "@/lib/actions/rra-case.action";

type CaseRow = {
  id: string;
  traderId: string;
  traderName: string;
  businessName: string | null;
  traderTin: string | null;
  traderRole: string;
  title: string;
  reason: string;
  status: RraCaseStatus;
  priority: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
};

type CaseDetails = Awaited<ReturnType<typeof getRraCaseDetails>>;
type Officer = NonNullable<CaseDetails>["officers"][number];

const statusLabels: Record<RraCaseStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  awaiting_information: "Awaiting information",
  closed: "Closed",
};

export function RraCaseManagement({ initialCases, canRequestTaxpayerInformation }: { initialCases: CaseRow[]; canRequestTaxpayerInformation: boolean }) {
  const router = useRouter();
  const [cases, setCases] = useState(initialCases);
  const [selectedId, setSelectedId] = useState<string | null>(initialCases[0]?.id ?? null);
  const [details, setDetails] = useState<CaseDetails>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [requestType, setRequestType] = useState<"documents" | "corrections" | null>(null);
  const [requestDetails, setRequestDetails] = useState("");
  const [loadingDetails, startLoadingDetails] = useTransition();
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selectedId && !details) {
      getRraCaseDetails(selectedId).then(setDetails);
    }
  }, [selectedId, details]);

  const visibleCases = useMemo(() => cases.filter((item) => {
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || [item.title, item.businessName, item.traderName, item.traderTin, item.traderRole]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesStatus && matchesQuery;
  }), [cases, search, statusFilter]);

  const selectCase = (caseId: string) => {
    setSelectedId(caseId);
    setDetails(null);
    setMessage("");
    setRequestType(null);
    setRequestDetails("");
    startLoadingDetails(async () => setDetails(await getRraCaseDetails(caseId)));
  };

  const submitInformationRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !requestType) return;
    setMessage("");
    startSaving(async () => {
      try {
        const result = await requestTaxpayerInformation({ caseId: selectedId, requestType, details: requestDetails });
        if (!result.success) {
          setMessage(result.error);
          return;
        }
        const updated = await getRraCaseDetails(selectedId);
        setDetails(updated);
        if (updated) {
          setCases((current) => current.map((item) => item.id === selectedId ? {
            ...item,
            status: updated.status as RraCaseStatus,
            updatedAt: updated.updatedAt,
            closedAt: updated.closedAt,
          } : item));
        }
        setRequestType(null);
        setRequestDetails("");
        setMessage(requestType === "documents" ? "Document request sent to the taxpayer and added to the case history." : "Correction request sent to the taxpayer and added to the case history.");
        router.refresh();
      } catch (error) {
        console.error("Taxpayer follow-up request failed", error);
        setMessage("The taxpayer request could not be sent. Please try again.");
      }
    });
  };

  const submitUpdate = (payload: { status?: RraCaseStatus; assignedStaffId?: string | null; note?: string }) => {
    if (!selectedId) return;
    setMessage("");
    startSaving(async () => {
      const result = await updateRraCase({ caseId: selectedId, ...payload });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      const updated = await getRraCaseDetails(selectedId);
      setDetails(updated);
      if (updated) {
        setCases((current) => current.map((item) => item.id === selectedId ? {
          ...item,
          status: updated.status as RraCaseStatus,
          assignedStaffId: updated.assignedStaffId,
          assignedStaffName: updated.officers.find((officer) => officer.id === updated.assignedStaffId)?.name ?? null,
          updatedAt: updated.updatedAt,
          closedAt: updated.closedAt,
        } : item));
      }
      setMessage("Case updated and recorded in the audit trail.");
      router.refresh();
    });
  };

  const createCase = (formData: FormData) => {
    startSaving(async () => {
      const result = await createRraCase({
        traderTin: formData.get("traderTin"),
        title: formData.get("title"),
        reason: formData.get("reason"),
        priority: formData.get("priority"),
      });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setShowCreate(false);
      setMessage(`Case opened for ${result.traderName}.`);
      const created = await getRraCaseDetails(result.caseId);
      if (created) {
        setDetails(created);
        setSelectedId(created.id);
        setCases((current) => [{
          id: created.id,
          traderId: created.traderId,
          traderName: created.traderName,
          businessName: created.businessName,
          traderTin: created.traderTin,
          traderRole: created.traderRole,
          title: created.title,
          reason: created.reason,
          status: created.status as RraCaseStatus,
          priority: created.priority,
          assignedStaffId: created.assignedStaffId,
          assignedStaffName: null,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          closedAt: created.closedAt,
        }, ...current]);
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RRA Case Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assign reviews, record officer notes, and track case progress for registered traders.</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)}><Plus className="mr-2 h-4 w-4" />Open a case</Button>
      </div>

      {showCreate && <Card>
        <CardHeader><CardTitle className="text-base">Open trader review case</CardTitle></CardHeader>
        <CardContent>
          <form action={createCase} className="grid gap-3 md:grid-cols-2">
            <Input name="traderTin" placeholder="Trader TIN" required minLength={5} maxLength={32} />
            <Input name="title" placeholder="Case title" required minLength={3} maxLength={120} />
            <select name="priority" defaultValue="normal" className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent priority</option>
            </select>
            <Textarea name="reason" placeholder="Factual reason for the review" required minLength={10} maxLength={1200} className="md:col-span-2" />
            <div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Opening…" : "Create case"}</Button><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button></div>
          </form>
        </CardContent>
      </Card>}

      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.4fr)]">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="space-y-3 pb-3">
            <CardTitle className="text-base">Case queue <span className="text-muted-foreground">({visibleCases.length})</span></CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search trader or case" className="pl-9"/></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm">
                <option value="all">All status</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2">
            {visibleCases.length === 0 ? <p className="px-3 py-10 text-center text-sm text-muted-foreground">No cases match these filters.</p> : visibleCases.map((item) => (
              <button key={item.id} onClick={() => selectCase(item.id)} className={`mb-1 w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 ${selectedId === item.id ? "border-primary bg-muted/50" : "border-transparent"}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-medium">{item.title}</span><Badge variant={item.status === "closed" ? "secondary" : "outline"}>{statusLabels[item.status]}</Badge></div>
                <p className="mt-1 text-sm text-muted-foreground">{item.businessName ?? item.traderName} · {item.traderRole}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>TIN {item.traderTin ?? "—"}</span><span className="capitalize">{item.priority} priority</span><span>{item.assignedStaffName ? `Assigned: ${item.assignedStaffName}` : "Unassigned"}</span></div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-y-auto">
          {!selectedId ? <CardContent className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a case to review its history.</CardContent>
            : loadingDetails || !details ? <CardContent className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></CardContent>
            : <>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-lg">{details.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{details.businessName ?? details.traderName} · {details.traderRole} · TIN {details.traderTin ?? "—"}</p></div><Badge variant="outline" className="capitalize">{details.priority} priority</Badge></div>
              </CardHeader>
              <CardContent className="space-y-5 p-4">
                <section><h3 className="mb-1 text-sm font-semibold">Review reason</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{details.reason}</p></section>
                {canRequestTaxpayerInformation && details.status !== "closed" && <section className="space-y-3 rounded-md border p-3">
                  <div><h3 className="text-sm font-semibold">Request taxpayer follow-up</h3><p className="mt-1 text-xs text-muted-foreground">Requests are sent to the taxpayer’s TaxFlow notifications and recorded in the case history.</p></div>
                  {!requestType ? <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setRequestType("documents")}>Request documents</Button>
                    <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setRequestType("corrections")}>Request corrections</Button>
                  </div> : <form onSubmit={submitInformationRequest} className="space-y-2">
                    <label htmlFor="taxpayer-followup-details" className="text-sm font-medium">{requestType === "documents" ? "Documents needed" : "Corrections needed"}</label>
                    <Textarea id="taxpayer-followup-details" value={requestDetails} onChange={(event) => setRequestDetails(event.target.value)} minLength={10} maxLength={1500} required rows={3} disabled={saving} placeholder={requestType === "documents" ? "List the documents the taxpayer should provide." : "Describe the information that needs correction."} />
                    <div className="flex gap-2"><Button type="submit" size="sm" disabled={saving || requestDetails.trim().length < 10}>{saving ? "Sending…" : "Send request"}</Button><Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => { setRequestType(null); setRequestDetails(""); }}>Cancel</Button></div>
                  </form>}
                </section>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">Status<select value={details.status} disabled={details.status === "closed" || saving} onChange={(event) => submitUpdate({ status: event.target.value as RraCaseStatus })} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">Assigned officer<select value={details.assignedStaffId ?? ""} disabled={details.status === "closed" || saving} onChange={(event) => submitUpdate({ assignedStaffId: event.target.value || null })} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">Unassigned</option>{details.officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name} · {officer.clearanceLevel.replaceAll("_", " ")}</option>)}</select></label>
                </div>
                {details.status !== "closed" && <form action={(formData) => { const note = String(formData.get("note") ?? "").trim(); if (note) submitUpdate({ note }); }} className="space-y-2"><label className="text-sm font-semibold" htmlFor="case-note">Add officer note</label><Textarea id="case-note" name="note" placeholder="Record an observation or next step" required minLength={2} maxLength={1500}/><Button size="sm" type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Check className="mr-2 h-4 w-4"/>}Save note</Button></form>}
                {details.status !== "closed" && <Button variant="outline" size="sm" disabled={saving} onClick={() => submitUpdate({ status: "closed" })}>Close case tracking</Button>}
                <section className="border-t pt-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4"/>Case history</h3><ol className="space-y-3">{details.events.map((event) => <li key={event.id} className="relative border-l pl-4 text-sm"><span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-primary"/><p className="font-medium">{eventLabel(event.eventType)}</p>{event.note && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{event.note}</p>}{event.fromValue && <p className="text-xs text-muted-foreground">{event.fromValue.replaceAll("_", " ")} → {event.toValue?.replaceAll("_", " ")}</p>}<p className="mt-1 text-xs text-muted-foreground">{event.actorName ?? "System"} · {new Date(event.createdAt).toLocaleString()}</p></li>)}</ol></section>
                <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>Closing this item closes the case tracking workflow only. Tax, clearance, payment, dispute, and enforcement outcomes remain human decisions in their respective processes.</p>
              </CardContent>
            </>}
        </Card>
      </div>
    </div>
  );
}

function eventLabel(type: string) {
  const labels: Record<string, string> = { case_opened: "Case opened", note_added: "Officer note added", status_changed: "Status changed", assignment_changed: "Assignment changed", documents_requested: "Documents requested from taxpayer", corrections_requested: "Corrections requested from taxpayer" };
  return labels[type] ?? type.replaceAll("_", " ");
}
