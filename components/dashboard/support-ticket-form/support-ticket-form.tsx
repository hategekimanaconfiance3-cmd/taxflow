"use client";

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createTicket } from '@/lib/actions/support-ticket.action';
import { AlertCircle, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const categories = [
  { value: 'general', label: 'General question' },
  { value: 'tax_query', label: 'Tax question' },
  { value: 'account_issue', label: 'Account issue' },
  { value: 'system_bug', label: 'Website or system issue' },
  { value: 'other', label: 'Other' },
] as const;

type Category = (typeof categories)[number]['value'];

export function SupportTicketForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<Category>('general');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();

    if (!trimmedSubject || !trimmedDescription) {
      setError('Enter a subject and describe how we can help.');
      return;
    }

    startTransition(async () => {
      try {
        setError('');
        await createTicket({
          category,
          subject: trimmedSubject,
          description: trimmedDescription,
        });
        router.push('/dashboard/support');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to create your ticket. Please try again.');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ticket details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ticket-category">Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as Category)} disabled={isPending}>
              <SelectTrigger id="ticket-category" className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Briefly describe your issue"
              maxLength={200}
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea
              id="ticket-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Include the steps you took and what happened. Do not include your password."
              maxLength={10000}
              rows={7}
              required
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">{description.length}/10,000 characters</p>
          </div>

          <Button type="submit" disabled={isPending || !subject.trim() || !description.trim()} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isPending ? 'Submitting…' : 'Submit Ticket'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
