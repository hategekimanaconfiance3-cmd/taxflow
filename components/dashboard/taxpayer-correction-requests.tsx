"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadPresigned } from "@vercel/blob/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  createCorrectionEvidenceUploadPath,
  submitAdditionalCorrectionEvidence,
  submitTaxpayerCorrectionRequest,
} from "@/lib/actions/taxpayer-correction.action";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const correctionFormSchema = z.object({
  fieldKey: z.enum(["name", "businessName", "email", "phoneNumber", "businessType"]),
  requestedValue: z.string().trim().min(1, "Enter the corrected information.").max(500),
  reason: z.string().trim().min(10, "Explain the correction in at least 10 characters.").max(2000),
});
type CorrectionForm = z.infer<typeof correctionFormSchema>;
type RequestRow = Awaited<ReturnType<typeof import("@/lib/actions/taxpayer-correction.action").getMyTaxpayerCorrectionRequests>>[number];
type UploadedEvidence = { pathname: string; filename: string };

const fieldLabels: Record<CorrectionForm["fieldKey"], string> = {
  name: "Personal name",
  businessName: "Business name",
  email: "Email address",
  phoneNumber: "Phone number",
  businessType: "Business type",
};

async function uploadEvidence(file: File): Promise<UploadedEvidence> {
  const pathname = await createCorrectionEvidenceUploadPath();
  const uploaded = await uploadPresigned(pathname, file, {
    access: "private",
    contentType: "application/pdf",
    handleUploadUrl: "/api/corrections/evidence",
  });
  return { pathname: uploaded.pathname, filename: file.name };
}

export function TaxpayerCorrectionRequests({ initialRequests }: { initialRequests: RequestRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<UploadedEvidence[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<Record<string, UploadedEvidence[]>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const submissionKey = useRef(globalThis.crypto.randomUUID());
  const form = useForm<CorrectionForm>({
    resolver: zodResolver(correctionFormSchema),
    defaultValues: { fieldKey: "name", requestedValue: "", reason: "" },
  });

  async function uploadSelected(input: FileList | null, onComplete: (uploaded: UploadedEvidence[]) => void, currentCount: number) {
    if (!input?.length) return;
    const selected = Array.from(input);
    if (selected.length + currentCount > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} PDF files.`);
      return;
    }
    if (selected.some((file) => file.type !== "application/pdf" || file.size <= 0 || file.size > MAX_FILE_SIZE)) {
      setError("Choose PDF files that are between 1 byte and 10 MB each.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const uploaded: UploadedEvidence[] = [];
      for (const file of selected) uploaded.push(await uploadEvidence(file));
      onComplete(uploaded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function submitRequest(values: CorrectionForm) {
    startTransition(async () => {
      setError("");
      try {
        const result = await submitTaxpayerCorrectionRequest({
          ...values,
          submissionKey: submissionKey.current,
          evidencePathnames: files.map((file) => file.pathname),
        });
        submissionKey.current = globalThis.crypto.randomUUID();
        setFiles([]);
        form.reset();
        router.refresh();
        setError(`Request ${result.reference} was submitted for review.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The correction request could not be submitted.");
      }
    });
  }

  function submitEvidence(requestId: string) {
    const attached = evidenceFiles[requestId] ?? [];
    if (!attached.length) return;
    startTransition(async () => {
      setError("");
      try {
        await submitAdditionalCorrectionEvidence({ requestId, evidencePathnames: attached.map((file) => file.pathname) });
        setEvidenceFiles((current) => ({ ...current, [requestId]: [] }));
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Additional evidence could not be submitted.");
      }
    });
  }

  return <div className="space-y-6">
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div><h2 className="text-lg font-semibold">Request a profile correction</h2><p className="mt-1 text-sm text-muted-foreground">Your current account information stays unchanged while the request is reviewed.</p></div>
      {error ? <p role="status" className="rounded-md border bg-muted p-3 text-sm">{error}</p> : null}
      <form className="space-y-4" onSubmit={form.handleSubmit(submitRequest)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Information to correct
            <select className="w-full rounded-md border bg-background px-3 py-2 font-normal" {...form.register("fieldKey")}>
              {Object.entries(fieldLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Correct information
            <input className="w-full rounded-md border bg-background px-3 py-2 font-normal" maxLength={500} {...form.register("requestedValue")} />
          </label>
        </div>
        {form.formState.errors.requestedValue ? <p className="text-sm text-destructive">{form.formState.errors.requestedValue.message}</p> : null}
        <label className="block space-y-1 text-sm font-medium">Reason for the correction
          <textarea className="min-h-24 w-full rounded-md border bg-background p-3 font-normal" maxLength={2000} {...form.register("reason")} />
        </label>
        {form.formState.errors.reason ? <p className="text-sm text-destructive">{form.formState.errors.reason.message}</p> : null}
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="correction-evidence">Supporting documents (PDF, up to 5 files; 10 MB each)</label>
          <input ref={fileInput} id="correction-evidence" type="file" accept="application/pdf,.pdf" multiple disabled={uploading || busy} onChange={(event) => void uploadSelected(event.currentTarget.files, (uploaded) => setFiles((current) => [...current, ...uploaded]), files.length)} />
          {files.length ? <ul className="space-y-1 text-sm text-muted-foreground">{files.map((file) => <li key={file.pathname}>{file.filename}</li>)}</ul> : null}
        </div>
        <button type="submit" disabled={busy || uploading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Submitting…" : uploading ? "Uploading evidence…" : "Submit correction request"}</button>
      </form>
    </section>

    <section className="space-y-3 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">My correction requests</h2>
      {!initialRequests.length ? <p className="text-sm text-muted-foreground">You have not submitted any correction requests.</p> : initialRequests.map((item) => <article key={item.id} className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{item.reference}</h3><p className="text-sm text-muted-foreground">{fieldLabels[item.fieldKey as CorrectionForm["fieldKey"]] ?? item.fieldKey} · {item.createdAt.toLocaleDateString()}</p></div><span className="rounded-full border px-2 py-1 text-xs">{item.status.replaceAll("_", " ")}</span></div>
        <p className="text-sm">Requested value: <span className="font-medium">{item.requestedValue}</span></p>
        {item.status === "awaiting_evidence" ? <div className="space-y-2 border-t pt-3"><p className="text-sm">Reviewer request: <span className="text-muted-foreground">{item.evidenceRequestReason ?? "Additional information was requested."}</span></p><label className="block text-sm font-medium" htmlFor={`evidence-${item.id}`}>Upload the additional information requested by the reviewer</label><input id={`evidence-${item.id}`} type="file" accept="application/pdf,.pdf" multiple disabled={uploading || busy} onChange={(event) => void uploadSelected(event.currentTarget.files, (uploaded) => setEvidenceFiles((current) => ({ ...current, [item.id]: [...(current[item.id] ?? []), ...uploaded] })), evidenceFiles[item.id]?.length ?? 0)} />{evidenceFiles[item.id]?.length ? <p className="text-sm text-muted-foreground">{evidenceFiles[item.id].map((file) => file.filename).join(", ")}</p> : null}<button type="button" disabled={busy || uploading || !evidenceFiles[item.id]?.length} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" onClick={() => submitEvidence(item.id)}>Submit additional evidence</button></div> : null}
      </article>)}
    </section>
  </div>;
}
