"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { createTicket } from "@/lib/actions/support-ticket.action";
import { AlertCircle, CheckCircle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ticketCreateSchema } from "@/lib/validation/support-ticket";

const categories = [
  { value: "general", label: "General question" },
  { value: "tax_query", label: "Tax question" },
  { value: "account_issue", label: "Account issue" },
  { value: "system_bug", label: "Website or system issue" },
  { value: "other", label: "Other" },
] as const;

type TicketValues = z.infer<typeof ticketCreateSchema>;

export function SupportTicketForm() {
  const [error, setError] = useState("");
  const [createdTicket, setCreatedTicket] = useState<{ id: string; ticketReference: string } | null>(null);
  const form = useForm<TicketValues>({
    resolver: zodResolver(ticketCreateSchema),
    defaultValues: { category: "general", subject: "", description: "" },
  });
  const category = useWatch({ control: form.control, name: "category" });
  const description = useWatch({ control: form.control, name: "description" });

  async function submit(values: TicketValues) {
    setError("");
    setCreatedTicket(null);
    try {
      const response = await createTicket(values);
      setCreatedTicket({ id: response.id, ticketReference: response.ticketReference });
      form.reset({ category: "general", subject: "", description: "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create your ticket. Please try again.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Ticket details</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
          {createdTicket && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 shrink-0" />Ticket {createdTicket.ticketReference} submitted successfully.</span>
            <Button asChild type="button" variant="outline" size="sm"><Link href={"/dashboard/support/" + createdTicket.id}>View Ticket</Link></Button>
          </div>}
          {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

          <div className="space-y-2">
            <Label htmlFor="ticket-category">Category</Label>
            <Select value={category} onValueChange={(value) => form.setValue("category", value as TicketValues["category"], { shouldValidate: true })} disabled={isSubmitting}>
              <SelectTrigger id="ticket-category" className="w-full"><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>{categories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input id="ticket-subject" maxLength={200} placeholder="Briefly describe your issue" disabled={isSubmitting} {...form.register("subject")} />
            {form.formState.errors.subject?.message && <p role="alert" className="text-sm text-red-600">{form.formState.errors.subject.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea id="ticket-description" maxLength={10_000} rows={7} placeholder="Include the steps you took and what happened. Do not include your password." disabled={isSubmitting} {...form.register("description")} />
            {form.formState.errors.description?.message && <p role="alert" className="text-sm text-red-600">{form.formState.errors.description.message}</p>}
            <p className="text-xs text-muted-foreground">{description.length}/10,000 characters</p>
          </div>

          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isSubmitting ? "Submitting…" : "Submit Ticket"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
