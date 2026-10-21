"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Search, Loader2, UserRoundSearch } from "lucide-react";
import { lookupTraderByTin } from "@/lib/actions/admin-tin-lookup.action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LookupResult = NonNullable<Awaited<ReturnType<typeof lookupTraderByTin>>>;

const money = (amount: number) => new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(amount);
const date = (value: Date | string) => new Date(value).toLocaleDateString();

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}

export function TraderLookupDetails({ result }: { result: LookupResult }) {
  const { profile } = result;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle className="text-lg">{profile.businessName ?? profile.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{profile.name}</p></div>
            <div className="flex gap-2"><Badge variant="outline" className="capitalize">{profile.role}</Badge><Badge variant="secondary" className="capitalize">{profile.clearanceStatus ?? "unknown"}</Badge></div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-muted-foreground">TIN</p><p className="font-mono font-semibold">{profile.tinNumber}</p></div>
          <div><p className="text-muted-foreground">Registered</p><p>{date(profile.registeredAt)}</p></div>
          {profile.phoneNumber !== undefined && <div><p className="text-muted-foreground">Phone</p><p>{profile.phoneNumber || "—"}</p></div>}
          {profile.email !== undefined && <div><p className="text-muted-foreground">Email</p><p>{profile.email || "—"}</p></div>}
          <div className="sm:col-span-2 lg:col-span-4"><p className="text-xs text-muted-foreground">Information available to your roles: <span className="capitalize">{result.staffRoles.map((role) => role.replaceAll("_", " ")).join(", ")}</span></p></div>
        </CardContent>
      </Card>

      {result.financial && <Panel title="Tax and VAT summary"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ["VAT output", money(result.financial.vatOutput)], ["VAT input", money(result.financial.vatInput)], ["Net VAT due", money(result.financial.netVatDue)], ["Confirmed payments", money(result.financial.confirmedPayments)], ["Outstanding", money(result.financial.outstanding)], ["Confirmed payment count", result.financial.paymentCount],
      ].map(([label, value]) => <div key={label} className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div></Panel>}

      {result.transactions && <Panel title="Recent sales and transactions">{result.transactions.length ? <div className="divide-y">{result.transactions.map((item, index) => <div key={`${item.createdAt}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{item.productName} · {item.quantity} units · {item.status}</span><span className="text-muted-foreground">{money(item.totalAmount)} · {date(item.createdAt)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No transactions found.</p>}</Panel>}

      {result.imports && <Panel title="Import declarations">{result.imports.length ? <div className="divide-y">{result.imports.map((item, index) => <div key={`${item.declarationRef}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{item.productName} · {item.declarationRef ?? "No reference"} · {item.status}</span><span className="text-muted-foreground">Expected {item.expectedQuantity}{item.actualQuantity == null ? "" : ` · Arrived ${item.actualQuantity}`} · {date(item.createdAt)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No import declarations found.</p>}</Panel>}

      {result.stock && <Panel title="Current stock">{result.stock.length ? <div className="divide-y">{result.stock.map((item, index) => <div key={`${item.productName}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{item.productName}</span><span className="text-muted-foreground">{item.quantity} {item.unit}{item.price == null ? "" : ` · ${money(item.price)} each`}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No stock records found.</p>}</Panel>}

      {result.corrections && <Panel title="Stock correction history">{result.corrections.length ? <div className="divide-y">{result.corrections.map((item, index) => <div key={`${item.productName}-${item.createdAt}-${index}`} className="py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{item.productName} · {item.movementType.replaceAll("_", " ")}</span><span className="text-muted-foreground">{item.quantityDelta > 0 ? "+" : ""}{item.quantityDelta} · {date(item.createdAt)}</span></div>{item.reason && <p className="mt-1 text-muted-foreground">{item.reason}</p>}</div>)}</div> : <p className="text-sm text-muted-foreground">No stock corrections recorded.</p>}</Panel>}

      {result.payments && <Panel title="Recent tax payments">{result.payments.length ? <div className="divide-y">{result.payments.map((item, index) => <div key={`${item.reference}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{money(item.amount)} · {item.status} · {item.method.replaceAll("_", " ")}</span><span className="text-muted-foreground">{item.reference ?? "No reference"} · {date(item.createdAt)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No tax payments found.</p>}</Panel>}

      {result.supportRequests && <Panel title="Support requests">{result.supportRequests.length ? <div className="divide-y">{result.supportRequests.map((item, index) => <div key={`${item.subject}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{item.subject} · {item.status}</span><span className="text-muted-foreground">{item.priority} · {date(item.createdAt)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No support requests found.</p>}</Panel>}

      {result.disputes && <Panel title="Disputes">{result.disputes.length ? <div className="divide-y">{result.disputes.map((item) => <div key={item.referenceNumber} className="py-2 text-sm"><div className="flex justify-between gap-2"><span>{item.referenceNumber} · {item.status}</span><span className="text-muted-foreground">{date(item.createdAt)}</span></div><p className="mt-1 text-muted-foreground">{item.reason}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No disputes filed by this trader.</p>}</Panel>}
    </div>
  );
}

export function TinTaxpayerLookup() {
  const [tin, setTin] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        const found = await lookupTraderByTin(tin);
        if (!found) setError("No trader was found with that TIN.");
        else setResult(found);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "TIN lookup failed. Please try again.");
      }
    });
  }

  return <div className="space-y-4">
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRoundSearch className="h-4 w-4" />Trader lookup by TIN</CardTitle><p className="text-sm text-muted-foreground">Enter the caller’s TIN to see trader information available to your RRA role.</p></CardHeader>
      <CardContent><form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <Input value={tin} onChange={(event) => setTin(event.target.value)} placeholder="Enter trader TIN" inputMode="numeric" autoComplete="off" maxLength={32} aria-label="Trader TIN" />
        <Button type="submit" disabled={isPending || tin.trim().length < 5} className="gap-2 sm:min-w-32">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{isPending ? "Searching…" : "Search TIN"}</Button>
      </form>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</CardContent>
    </Card>
    {result && <TraderLookupDetails result={result} />}
  </div>;
}
