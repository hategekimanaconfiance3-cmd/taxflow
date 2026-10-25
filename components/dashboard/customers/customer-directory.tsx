'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { customerSchema, type CustomerInput } from '@/lib/validation/customer.schema';
import { saveBusinessCustomer, setBusinessCustomerActive, type CustomerDirectoryRow } from '@/lib/actions/customer.action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CustomerDirectoryProps {
  customers: CustomerDirectoryRow[];
}

const blankCustomer: CustomerInput = { name: '', customerType: 'individual', tinNumber: '', phone: '', email: '' };

export function CustomerDirectory({ customers }: CustomerDirectoryProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | undefined>();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const form = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: blankCustomer });

  function startEdit(record: CustomerDirectoryRow) {
    setEditingId(record.id);
    setMessage(null);
    form.reset({
      name: record.name,
      customerType: record.customerType as CustomerInput['customerType'],
      tinNumber: record.tinNumber ?? '',
      phone: record.phone ?? '',
      email: record.email ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(undefined);
    form.reset(blankCustomer);
  }

  const save = form.handleSubmit((values) => startTransition(async () => {
    setMessage(null);
    const result = await saveBusinessCustomer({ id: editingId, customer: values });
    if (!result.success) {
      setMessage({ text: result.error, error: true });
      return;
    }
    setMessage({ text: editingId ? 'Customer details updated.' : 'Customer added to your directory.', error: false });
    cancelEdit();
    router.refresh();
  }));

  function toggleActive(record: CustomerDirectoryRow) {
    startTransition(async () => {
      const result = await setBusinessCustomerActive(record.id, !record.isActive);
      setMessage(result.success
        ? { text: record.isActive ? 'Customer deactivated. Existing records remain available.' : 'Customer reactivated.', error: false }
        : { text: result.error ?? 'Unable to update customer.', error: true });
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{editingId ? 'Edit customer' : 'Add customer'}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Name</Label>
              <Input id="customer-name" maxLength={160} {...form.register('name')} />
              {form.formState.errors.name && <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-type">Customer type</Label>
              <select id="customer-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" {...form.register('customerType')}>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
                <option value="institution">Institution</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-tin">TIN (optional)</Label>
              <Input id="customer-tin" inputMode="numeric" maxLength={9} {...form.register('tinNumber')} />
              {form.formState.errors.tinNumber && <p className="text-sm text-red-600">{form.formState.errors.tinNumber.message}</p>}
              <p className="text-xs text-muted-foreground">A saved TIN is not verified against RRA records.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Phone (optional)</Label>
              <Input id="customer-phone" type="tel" maxLength={40} {...form.register('phone')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer-email">Email (optional)</Label>
              <Input id="customer-email" type="email" maxLength={254} {...form.register('email')} />
            </div>
            {message && <p role="status" className={`text-sm sm:col-span-2 ${message.error ? 'text-red-600' : 'text-emerald-700'}`}>{message.text}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add customer'}</Button>
              {editingId && <Button type="button" variant="outline" onClick={cancelEdit} disabled={isPending}>Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Customer directory ({customers.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {customers.length === 0 && <p className="text-sm text-muted-foreground">No customers saved yet. You can still record one-time consumer sales without adding them to this directory.</p>}
          {customers.map((record) => (
            <div key={record.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{record.name} <span className="ml-1 text-xs capitalize text-muted-foreground">{record.customerType}</span></p>
                <p className="text-sm text-muted-foreground">{record.tinNumber ? `TIN ${record.tinNumber}` : 'No TIN saved'}{record.phone ? ` · ${record.phone}` : ''}{record.email ? ` · ${record.email}` : ''}</p>
                <p className={`text-xs ${record.isActive ? 'text-emerald-700' : 'text-muted-foreground'}`}>{record.isActive ? 'Active' : 'Inactive'}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => startEdit(record)} disabled={isPending}>Edit</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => toggleActive(record)} disabled={isPending}>{record.isActive ? 'Deactivate' : 'Reactivate'}</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
