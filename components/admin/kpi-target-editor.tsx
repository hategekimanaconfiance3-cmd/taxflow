"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setKPITarget } from "@/lib/actions/admin-kpi-targets.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function KpiTargetEditor({ metricKey, metricLabel, unit, targetValue, period }: {
  metricKey: string;
  metricLabel: string;
  unit: string;
  targetValue: number | null;
  period: "monthly" | "quarterly" | "annual";
}) {
  const router = useRouter();
  const [value, setValue] = useState(targetValue === null ? "" : String(targetValue));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const target = Number(value);
    if (!Number.isFinite(target) || target <= 0) {
      setMessage("Enter a target greater than zero.");
      return;
    }
    startTransition(async () => {
      try {
        await setKPITarget({ key: metricKey, targetValue: target, period });
        setMessage(`${metricLabel} target saved.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Target could not be saved.");
      }
    });
  }
  return <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
    <label className="grid gap-1 text-[11px] text-muted-foreground">Set {period} target
      <div className="flex items-center gap-2"><Input className="h-8 w-36" type="number" min="0.01" step={unit === "%" ? "0.1" : "1"} value={value} onChange={(event) => setValue(event.target.value)} aria-label={`${metricLabel} ${period} target`} /><span className="text-xs">{unit}</span></div>
    </label>
    <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save target"}</Button>
    {message && <p className="basis-full text-xs text-muted-foreground" role="status">{message}</p>}
  </form>;
}
