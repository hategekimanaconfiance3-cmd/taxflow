"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Activity, Building2, Factory, FileBox, LoaderCircle, PackageCheck, Search, ShieldAlert, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { editManufacturerProfile, getManufacturerActivity, searchManufacturersForActivity, setManufacturerAccountStatus } from "@/lib/actions/manufacturing-activity.action";
import type { ManufacturerActivityEvent, ManufacturerActivityTarget, ManufacturerActivityView } from "@/lib/manufacturing-activity.types";

const searchSchema = z.object({ search: z.string().trim().max(120, "Search is too long.") });
const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter a display name.").max(120),
  businessName: z.string().trim().max(160),
  reason: z.string().trim().min(10, "Provide at least 10 characters for the audit reason.").max(500),
});
const statusSchema = z.object({
  reason: z.string().trim().min(10, "Provide at least 10 characters for the audit reason.").max(500),
});

type Props = {
  initialManufacturers: ManufacturerActivityTarget[];
  initialActivity: ManufacturerActivityView | null;
  canManageAccounts: boolean;
  canEditProfiles: boolean;
};
type SearchFields = z.infer<typeof searchSchema>;
type ProfileFields = z.infer<typeof profileSchema>;
type StatusFields = z.infer<typeof statusSchema>;
type Notice = { tone: "success" | "error"; message: string } | null;

const kindLabels = { production: "Production", sales: "Sales", imports: "Imports", stock: "Stock ledger", fulfillment: "B2B fulfillment", account: "Account" } as const;
const kindIcons = { production: Factory, sales: Store, imports: FileBox, stock: Activity, fulfillment: PackageCheck, account: ShieldAlert } as const;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(target: ManufacturerActivityTarget): string {
  if (!target.isActive || target.clearanceStatus === "suspended") return "Suspended";
  return target.clearanceStatus.replaceAll("_", " ");
}

function ActivityRow({ event }: { event: ManufacturerActivityEvent }) {
  const Icon = kindIcons[event.kind];
  return (
    <li className="grid gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[auto_1fr_auto] sm:items-start">
      <span className="mt-0.5 rounded-md border p-2 text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{event.title}</span>
          <Badge variant="outline">{kindLabels[event.kind]}</Badge>
          {event.status ? <Badge variant="secondary">{event.status.replaceAll("_", " ")}</Badge> : null}
        </div>
        <span className="text-sm text-muted-foreground">{event.productName}{event.quantity ? ` · Quantity ${event.quantity}` : ""}</span>
        {event.corrects ? <span className="text-sm text-muted-foreground">Corrects: {event.corrects.title} · {formatDate(event.corrects.occurredAt)}</span> : null}
      </div>
      <time className="text-sm text-muted-foreground sm:text-right" dateTime={new Date(event.occurredAt).toISOString()}>{formatDate(event.occurredAt)}</time>
    </li>
  );
}

export function ManufacturingActivityWorkspace({ initialManufacturers, initialActivity, canManageAccounts, canEditProfiles }: Props) {
  const [manufacturers, setManufacturers] = useState(initialManufacturers);
  const [activity, setActivity] = useState(initialActivity);
  const [selectedId, setSelectedId] = useState(initialActivity?.manufacturer.id ?? "");
  const [notice, setNotice] = useState<Notice>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"under_review" | "suspended" | "restore" | "unsuspend">("under_review");
  const [isSaving, setIsSaving] = useState(false);

  const searchForm = useForm<SearchFields>({ resolver: zodResolver(searchSchema), defaultValues: { search: "" } });
  const profileForm = useForm<ProfileFields>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: activity?.manufacturer.name ?? "", businessName: activity?.manufacturer.businessName ?? "", reason: "" },
  });
  const statusForm = useForm<StatusFields>({ resolver: zodResolver(statusSchema), defaultValues: { reason: "" } });
  const selected = activity?.manufacturer ?? manufacturers.find((item) => item.id === selectedId) ?? null;

  async function submitSearch(values: SearchFields): Promise<void> {
    setNotice(null);
    setIsSearching(true);
    const result = await searchManufacturersForActivity(values);
    setIsSearching(false);
    if (!result.success) {
      setNotice({ tone: "error", message: result.error });
      return;
    }
    setManufacturers(result.data);
    if (result.data.length === 0) {
      setActivity(null);
      setSelectedId("");
      return;
    }
    await selectManufacturer(result.data[0].id);
  }

  async function selectManufacturer(id: string): Promise<void> {
    setSelectedId(id);
    setNotice(null);
    setIsLoadingActivity(true);
    const result = await getManufacturerActivity({ manufacturerId: id });
    setIsLoadingActivity(false);
    if (!result.success) {
      setActivity(null);
      setNotice({ tone: "error", message: result.error });
      return;
    }
    setActivity(result.data);
    profileForm.reset({ name: result.data.manufacturer.name, businessName: result.data.manufacturer.businessName ?? "", reason: "" });
  }

  async function submitProfile(values: ProfileFields): Promise<void> {
    if (!selected) return;
    setIsSaving(true);
    setNotice(null);
    const result = await editManufacturerProfile({ manufacturerId: selected.id, ...values });
    setIsSaving(false);
    if (!result.success) {
      setNotice({ tone: "error", message: result.error });
      return;
    }
    const updated = { ...selected, name: values.name, businessName: values.businessName || null };
    setManufacturers((current) => current.map((item) => item.id === updated.id ? updated : item));
    const refreshed = await getManufacturerActivity({ manufacturerId: selected.id });
    if (refreshed.success) {
      setActivity(refreshed.data);
      setManufacturers((current) => current.map((item) => item.id === refreshed.data.manufacturer.id ? refreshed.data.manufacturer : item));
    } else {
      setActivity((current) => current ? { ...current, manufacturer: updated } : current);
    }
    setProfileOpen(false);
    setNotice({ tone: "success", message: result.data.changed ? "Manufacturer profile updated and audit recorded." : "No profile changes were needed." });
  }

  async function submitStatus(values: StatusFields): Promise<void> {
    if (!selected) return;
    setIsSaving(true);
    setNotice(null);
    const result = await setManufacturerAccountStatus({ manufacturerId: selected.id, status: statusAction, reason: values.reason });
    setIsSaving(false);
    if (!result.success) {
      setNotice({ tone: "error", message: result.error });
      return;
    }
    const updated = { ...selected, clearanceStatus: result.data.status, isActive: result.data.isActive };
    setManufacturers((current) => current.map((item) => item.id === updated.id ? updated : item));
    const refreshed = await getManufacturerActivity({ manufacturerId: selected.id });
    if (refreshed.success) {
      setActivity(refreshed.data);
      setManufacturers((current) => current.map((item) => item.id === refreshed.data.manufacturer.id ? refreshed.data.manufacturer : item));
    } else {
      setActivity((current) => current ? { ...current, manufacturer: updated } : current);
    }
    setStatusOpen(false);
    statusForm.reset({ reason: "" });
    setNotice({
      tone: "success",
      message: statusAction === "suspended"
        ? "Account suspended, active sessions revoked, and audit recorded."
        : statusAction === "restore"
          ? "Account restored to the status before its latest account action. The correction was recorded as a new audit event."
          : statusAction === "unsuspend"
            ? "Account unsuspended and set to approved. The action was recorded in the audit log."
            : "Account marked for review and audit recorded.",
    });
  }

  return (
    <main className="grid gap-6 p-4 md:p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Manufacturing Activity</h1>
        <p className="text-sm text-muted-foreground">Review manufacturer production, sales, imports, stock-ledger and B2B fulfillment activity.</p>
      </header>

      {notice ? <p role="status" className={`rounded-md border px-4 py-3 text-sm ${notice.tone === "error" ? "border-destructive/40 text-destructive" : "border-emerald-600/40 text-emerald-700"}`}>{notice.message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Search className="size-4" aria-hidden="true" />Find a manufacturer</CardTitle>
          <CardDescription>Search is limited to manufacturer name and business name. Results do not include TIN, contact, tax, payment or formula data.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={searchForm.handleSubmit(submitSearch)}>
            <div className="grid flex-1 gap-2">
              <Label htmlFor="manufacturer-search">Manufacturer or business name</Label>
              <Input id="manufacturer-search" autoComplete="off" {...searchForm.register("search")} />
              {searchForm.formState.errors.search ? <p className="text-sm text-destructive">{searchForm.formState.errors.search.message}</p> : null}
            </div>
            <Button className="self-end" type="submit" disabled={isSearching}>{isSearching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}Search</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Manufacturers ({manufacturers.length})</CardTitle><CardDescription>Showing up to the 100 most recently registered matches.</CardDescription></CardHeader>
          <CardContent className="grid max-h-[34rem] gap-2 overflow-y-auto">
            {manufacturers.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">No manufacturers match this search.</p> : manufacturers.map((manufacturer) => (
              <button key={manufacturer.id} type="button" onClick={() => void selectManufacturer(manufacturer.id)} className={`grid gap-1 rounded-md border p-3 text-left transition-colors hover:bg-muted ${selectedId === manufacturer.id ? "border-primary bg-muted" : ""}`}>
                <span className="font-medium">{manufacturer.businessName || manufacturer.name}</span>
                {manufacturer.businessName && manufacturer.name !== manufacturer.businessName ? <span className="text-sm text-muted-foreground">{manufacturer.name}</span> : null}
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><Badge variant={!manufacturer.isActive ? "destructive" : "outline"}>{statusLabel(manufacturer)}</Badge>Joined {new Date(manufacturer.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <section className="grid content-start gap-6" aria-label="Manufacturer activity details">
          {!selected ? <Card><CardContent className="grid min-h-72 place-items-center text-center text-sm text-muted-foreground"><div className="grid justify-items-center gap-3"><Building2 className="size-8" />Select a manufacturer to review activity.</div></CardContent></Card> : <>
            <Card>
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid gap-2">
                  <CardTitle>{selected.businessName || selected.name}</CardTitle>
                  <CardDescription>{selected.businessName && selected.name !== selected.businessName ? `Account name: ${selected.name} · ` : ""}Registered {formatDate(selected.createdAt)}</CardDescription>
                  <div><Badge variant={!selected.isActive ? "destructive" : "secondary"}>{statusLabel(selected)}</Badge></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEditProfiles ? <Button variant="outline" onClick={() => { profileForm.reset({ name: selected.name, businessName: selected.businessName ?? "", reason: "" }); setProfileOpen(true); }}>Edit business names</Button> : null}
                  {canManageAccounts && selected.clearanceStatus === "suspended" ? (
                    <>
                      <Button variant="default" onClick={() => { setStatusAction("unsuspend"); statusForm.reset({ reason: "" }); setStatusOpen(true); }}><ShieldAlert className="size-4" />Unsuspend account</Button>
                      <Button variant="outline" onClick={() => { setStatusAction("restore"); statusForm.reset({ reason: "" }); setStatusOpen(true); }}>Restore previous status</Button>
                    </>
                  ) : canManageAccounts && selected.isActive ? (
                    <Button variant="destructive" onClick={() => { setStatusAction("under_review"); statusForm.reset({ reason: "" }); setStatusOpen(true); }}><ShieldAlert className="size-4" />Manage account</Button>
                  ) : null}
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Recent activity</CardTitle><CardDescription>Latest {activity?.events.length ?? 0} records across production, sales, imports, B2B acceptance/dispatch/receipt, stock movements and account administration. Confidential formula names, taxpayer identifiers, contacts and tax/payment details are excluded.</CardDescription></CardHeader>
              <CardContent>
                {isLoadingActivity ? <div className="grid min-h-36 place-items-center"><LoaderCircle className="size-5 animate-spin" aria-label="Loading activity" /></div> : activity?.events.length ? <ol className="divide-y-0">{activity.events.map((event) => <ActivityRow key={event.key} event={event} />)}</ol> : <p className="py-8 text-center text-sm text-muted-foreground">No recorded activity was found for this manufacturer.</p>}
              </CardContent>
            </Card>
          </>}
        </section>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit manufacturer profile</DialogTitle><DialogDescription>Only display and business names can be changed here. TIN, contact details, status and financial records are not editable in this workspace.</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={profileForm.handleSubmit(submitProfile)}>
            <div className="grid gap-2"><Label htmlFor="profile-name">Account display name</Label><Input id="profile-name" {...profileForm.register("name")} />{profileForm.formState.errors.name ? <p className="text-sm text-destructive">{profileForm.formState.errors.name.message}</p> : null}</div>
            <div className="grid gap-2"><Label htmlFor="profile-business-name">Business name</Label><Input id="profile-business-name" {...profileForm.register("businessName")} />{profileForm.formState.errors.businessName ? <p className="text-sm text-destructive">{profileForm.formState.errors.businessName.message}</p> : null}</div>
            <div className="grid gap-2"><Label htmlFor="profile-reason">Reason for change</Label><Textarea id="profile-reason" rows={3} {...profileForm.register("reason")} />{profileForm.formState.errors.reason ? <p className="text-sm text-destructive">{profileForm.formState.errors.reason.message}</p> : null}</div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save audited changes"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{statusAction === "restore" ? "Restore manufacturer account" : statusAction === "unsuspend" ? "Unsuspend manufacturer account" : "Manage manufacturer account"}</DialogTitle><DialogDescription>{statusAction === "restore" ? "Restore the status and active state recorded immediately before the latest account action. This creates a new audited event and preserves the original history." : statusAction === "unsuspend" ? "Directly unsuspend this account and set it to approved. Provide a mandatory reason. This action is recorded in the audit log." : "Choose a controlled status action and record the reason. Suspension deactivates the account and revokes active sessions."}</DialogDescription></DialogHeader>
          {statusAction !== "restore" && statusAction !== "unsuspend" || selected?.clearanceStatus === "under_review" ? <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant={statusAction === "under_review" ? "default" : "outline"} onClick={() => setStatusAction("under_review")}>Mark under review</Button>
            <Button type="button" variant={statusAction === "suspended" ? "destructive" : "outline"} onClick={() => setStatusAction("suspended")}>Suspend account</Button>
            {selected?.clearanceStatus === "under_review" ? <Button type="button" variant={statusAction === "restore" ? "default" : "outline"} onClick={() => setStatusAction("restore")}>Restore previous status</Button> : null}
          </div> : null}
          <form className="grid gap-4" onSubmit={statusForm.handleSubmit(submitStatus)}>
            <div className="grid gap-2"><Label htmlFor="status-reason">Required reason</Label><Textarea id="status-reason" rows={4} {...statusForm.register("reason")} />{statusForm.formState.errors.reason ? <p className="text-sm text-destructive">{statusForm.formState.errors.reason.message}</p> : null}</div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button><Button type="submit" variant={statusAction === "suspended" ? "destructive" : "default"} disabled={isSaving}>{isSaving ? "Applying…" : statusAction === "suspended" ? "Suspend and revoke sessions" : statusAction === "restore" ? "Restore previous status" : statusAction === "unsuspend" ? "Unsuspend and approve account" : "Mark for review"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
