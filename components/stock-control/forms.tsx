"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  stockRestockExceptionReviewSchema,
  stockRestockRequestSchema,
  stockSellThroughBaselineAttestationSchema,
  stockSellThroughThresholdSchema,
} from "@/lib/validation/stock-sell-through.schema";
import {
  attestStockSellThroughBaselineAction,
  createRestockRequestAction,
  createSellThroughThresholdAction,
  reviewRestockExceptionAction,
} from "@/lib/actions/stock-sell-through.action";

type ProductOption = { id: string; name: string; unit: string; categoryCode: string | null };

function ErrorText({ children }: { children?: string }) {
  return children ? <p className="mt-1 text-sm text-red-700" role="alert">{children}</p> : null;
}

const controlClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const buttonClass = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";

export function RestockRequestForm({ products, idempotencyKey }: { products: ProductOption[]; idempotencyKey: string }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof stockRestockRequestSchema>, unknown, z.output<typeof stockRestockRequestSchema>>({
    resolver: zodResolver(stockRestockRequestSchema),
    defaultValues: { productId: "", requestedQuantity: "", idempotencyKey, exceptionReason: "" },
  });

  const submit = form.handleSubmit((values) => {
    const data = new FormData();
    data.set("productId", values.productId);
    data.set("requestedQuantity", String(values.requestedQuantity));
    data.set("idempotencyKey", values.idempotencyKey);
    data.set("exceptionReason", values.exceptionReason ?? "");
    startTransition(async () => { await createRestockRequestAction(data); });
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Product
          <select className={controlClass} {...form.register("productId")} disabled={pending || products.length === 0}>
            <option value="">Choose a product</option>
            {products.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
          </select>
          <ErrorText>{form.formState.errors.productId?.message}</ErrorText>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Requested quantity
          <input className={controlClass} type="number" min="0.000001" max="1000000000" step="any" inputMode="decimal" {...form.register("requestedQuantity")} disabled={pending} />
          <ErrorText>{form.formState.errors.requestedQuantity?.message}</ErrorText>
        </label>
      </div>
      <input type="hidden" {...form.register("idempotencyKey")} />
      <label className="block space-y-1 text-sm font-medium">
        Exception reason (optional)
        <textarea className={`${controlClass} min-h-20`} placeholder="If the threshold is not met, explain why an exception should be reviewed." {...form.register("exceptionReason")} disabled={pending} />
        <ErrorText>{form.formState.errors.exceptionReason?.message}</ErrorText>
      </label>
      {products.length === 0 && <p className="text-sm text-muted-foreground">No products are currently available to request.</p>}
      <button className={buttonClass} type="submit" disabled={pending || products.length === 0}>
        {pending ? "Submitting…" : "Check and submit restock request"}
      </button>
    </form>
  );
}

export function SellThroughThresholdForm({
  products,
  categories,
  canManageGlobal,
  effectiveAtDefault,
}: {
  products: ProductOption[];
  categories: string[];
  canManageGlobal: boolean;
  effectiveAtDefault: string;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof stockSellThroughThresholdSchema>, unknown, z.output<typeof stockSellThroughThresholdSchema>>({
    resolver: zodResolver(stockSellThroughThresholdSchema),
    defaultValues: { scopeType: canManageGlobal ? "default" : "category", scopeKey: canManageGlobal ? "*" : categories[0] ?? "", thresholdPercent: "", effectiveAt: effectiveAtDefault, reason: "" },
  });
  const [scopeType, setScopeType] = useState<"default" | "category" | "product">(canManageGlobal ? "default" : "category");

  const submit = form.handleSubmit((values) => {
    const data = new FormData();
    data.set("scopeType", values.scopeType);
    data.set("scopeKey", values.scopeKey);
    data.set("thresholdPercent", String(values.thresholdPercent));
    data.set("effectiveAt", values.effectiveAt);
    data.set("reason", values.reason);
    startTransition(async () => { await createSellThroughThresholdAction(data); });
  });

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">
        Threshold scope
        <select className={controlClass} {...form.register("scopeType", { onChange: (event) => setScopeType(event.target.value as "default" | "category" | "product") })} disabled={pending}>
          {canManageGlobal && <option value="default">System default</option>}
          <option value="category">Product category</option>
          <option value="product">Specific product</option>
        </select>
        <ErrorText>{form.formState.errors.scopeType?.message}</ErrorText>
      </label>
      {scopeType === "default" ? (
        <input type="hidden" value="*" {...form.register("scopeKey")} />
      ) : scopeType === "category" ? (
        <label className="space-y-1 text-sm font-medium">
          Category
          <select className={controlClass} {...form.register("scopeKey")} disabled={pending || categories.length === 0}>
            <option value="">Choose a category</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <ErrorText>{form.formState.errors.scopeKey?.message}</ErrorText>
        </label>
      ) : (
        <label className="space-y-1 text-sm font-medium">
          Product
          <select className={controlClass} {...form.register("scopeKey")} disabled={pending || products.length === 0}>
            <option value="">Choose a product</option>
            {products.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
          </select>
          <ErrorText>{form.formState.errors.scopeKey?.message}</ErrorText>
        </label>
      )}
      <label className="space-y-1 text-sm font-medium">
        Sell-through percentage
        <input className={controlClass} type="number" min="0" max="100" step="0.01" {...form.register("thresholdPercent")} disabled={pending} />
        <ErrorText>{form.formState.errors.thresholdPercent?.message}</ErrorText>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Effective date/time (UTC)
        <input className={controlClass} type="datetime-local" {...form.register("effectiveAt")} disabled={pending} />
        <ErrorText>{form.formState.errors.effectiveAt?.message}</ErrorText>
      </label>
      <label className="space-y-1 text-sm font-medium md:col-span-2">
        Reason for this policy change
        <textarea className={`${controlClass} min-h-20`} {...form.register("reason")} disabled={pending} />
        <ErrorText>{form.formState.errors.reason?.message}</ErrorText>
      </label>
      <div className="md:col-span-2">
        <button className={buttonClass} type="submit" disabled={pending || (scopeType === "category" && categories.length === 0) || (scopeType === "product" && products.length === 0)}>
          {pending ? "Saving…" : "Schedule threshold"}
        </button>
      </div>
    </form>
  );
}

export function RestockExceptionReviewForm({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof stockRestockExceptionReviewSchema>, unknown, z.output<typeof stockRestockExceptionReviewSchema>>({
    resolver: zodResolver(stockRestockExceptionReviewSchema),
    defaultValues: { requestId, decision: "approve", reason: "" },
  });
  const submit = form.handleSubmit((values) => {
    const data = new FormData();
    data.set("requestId", values.requestId);
    data.set("decision", values.decision);
    data.set("reason", values.reason);
    startTransition(async () => { await reviewRestockExceptionAction(data); });
  });

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-start">
      <input type="hidden" {...form.register("requestId")} />
      <label className="sr-only" htmlFor={`decision-${requestId}`}>Exception decision</label>
      <select id={`decision-${requestId}`} className={controlClass} {...form.register("decision")} disabled={pending}>
        <option value="approve">Approve exception</option>
        <option value="reject">Reject exception</option>
      </select>
      <label className="space-y-1 text-sm">
        <span className="sr-only">Review reason</span>
        <input className={controlClass} placeholder="Required review reason" {...form.register("reason")} disabled={pending} />
        <ErrorText>{form.formState.errors.reason?.message}</ErrorText>
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>{pending ? "Saving…" : "Record decision"}</button>
    </form>
  );
}

export function BaselineAttestationForm({ businessId, productId }: { businessId: string; productId: string }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof stockSellThroughBaselineAttestationSchema>, unknown, z.output<typeof stockSellThroughBaselineAttestationSchema>>({
    resolver: zodResolver(stockSellThroughBaselineAttestationSchema),
    defaultValues: { businessId, productId, reason: "" },
  });
  const submit = form.handleSubmit((values) => {
    const data = new FormData();
    data.set("businessId", values.businessId);
    data.set("productId", values.productId);
    data.set("reason", values.reason);
    startTransition(async () => { await attestStockSellThroughBaselineAction(data); });
  });

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
      <input type="hidden" {...form.register("businessId")} />
      <input type="hidden" {...form.register("productId")} />
      <label className="space-y-1 text-sm">
        <span className="sr-only">Baseline attestation reason</span>
        <input className={controlClass} placeholder="Reason after reviewing recorded balance" {...form.register("reason")} disabled={pending} />
        <ErrorText>{form.formState.errors.reason?.message}</ErrorText>
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>{pending ? "Attesting…" : "Attest recorded opening balance"}</button>
    </form>
  );
}
