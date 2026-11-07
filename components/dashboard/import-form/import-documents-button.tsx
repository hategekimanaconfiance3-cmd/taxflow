"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadPresigned } from "@vercel/blob/client";
import { submitImportDocuments } from "@/lib/actions/import.action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { FileCheck, FileText, FileUp, Loader2, Upload, X } from "lucide-react";

interface SubmitImportDocumentsButtonProps {
  declarationId: string;
  productName: string;
  expectedQuantity: number;
  invoiceRef?: string | null;
  supportingDoc?: string | null;
}

export function ImportDocumentsButton({
  declarationId, productName, expectedQuantity, invoiceRef: initialInvoiceRef = "", supportingDoc: initialSupportingDoc = "",
}: SubmitImportDocumentsButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [invoiceRef, setInvoiceRef] = useState(initialInvoiceRef ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState(initialSupportingDoc ?? "");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setError("Only PDF files are allowed."); return; }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) { setError("PDF must be between 1 byte and 10 MB."); return; }

    setError("");
    setSelectedFile(file);
    setUploadedUrl("");
    setIsUploading(true);
    try {
      const pathname = `imports/${declarationId}_${crypto.randomUUID()}.pdf`;
      const blob = await uploadPresigned(pathname, file, {
        access: "private", contentType: "application/pdf", handleUploadUrl: "/api/import-invoice",
      });
      const response = await fetch("/api/import-invoice/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declarationId, pathname: blob.pathname }),
      });
      const result = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok || !result?.url) throw new Error(result?.error || "Invoice verification failed.");
      setUploadedUrl(result.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Invoice upload failed.");
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    setUploadedUrl(initialSupportingDoc ?? "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit() {
    if (!invoiceRef.trim() || !uploadedUrl) return;
    startTransition(async () => {
      try {
        setError("");
        await submitImportDocuments(declarationId, { invoiceRef: invoiceRef.trim(), supportingDoc: uploadedUrl });
        setOpen(false);
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Could not save import documents.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1"><Upload className="h-3.5 w-3.5" />Attach invoice for inspection</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Provide import documents</DialogTitle>
          <DialogDescription>
            Add the invoice and reference for your expected goods. An authorized RRA Customs officer will physically inspect and record the quantity at arrival; you cannot approve or report the inspected quantity here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground"><strong>{productName}</strong> — Expected: <span className="font-mono">{expectedQuantity.toLocaleString()}</span></div>
          <div className="space-y-2">
            <Label htmlFor={`invoice-ref-${declarationId}`}>Invoice / Import Document Reference</Label>
            <Input id={`invoice-ref-${declarationId}`} value={invoiceRef} onChange={(event) => setInvoiceRef(event.target.value)} placeholder="e.g. INV-2026-001234" />
          </div>
          <div className="space-y-2">
            <Label>Invoice PDF <span className="text-red-500">*</span></Label>
            <p className="text-xs text-muted-foreground">Upload a legible invoice or import document (PDF, max 10 MB).</p>
            {!selectedFile ? (
              <div className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50" onClick={() => fileInputRef.current?.click()}>
                {uploadedUrl ? <FileCheck className="h-7 w-7 mx-auto text-emerald-600 mb-2" /> : <FileUp className="h-7 w-7 mx-auto text-muted-foreground mb-2" />}
                <p className="text-sm font-medium">{uploadedUrl ? "Invoice ready" : "Click to upload PDF"}</p>
                {uploadedUrl && <a href={uploadedUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 mt-1 text-xs text-primary underline"><FileText className="h-3 w-3" />View current invoice</a>}
                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />
              </div>
            ) : (
              <div className="border rounded-lg p-3 flex items-center gap-3">
                {isUploading ? <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" /> : <FileCheck className="h-5 w-5 text-emerald-600 shrink-0" />}
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{selectedFile.name}</p><p className="text-xs text-muted-foreground">{isUploading ? "Uploading…" : "Uploaded and verified"}</p></div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={clearSelectedFile} disabled={isUploading}><X className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || isUploading || !invoiceRef.trim() || !uploadedUrl} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Save documents for RRA inspection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
