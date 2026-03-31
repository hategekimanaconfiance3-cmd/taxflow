'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { verifyRRAStaff } from '@/lib/actions/auth.action';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const adminLoginSchema = z.object({
  staffId: z
    .string()
    .min(4, 'Staff ID must be at least 4 characters')
    .max(20, 'Staff ID must be at most 20 characters'),
  password: z.string().min(1, 'Password is required'),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminLoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { staffId: '', password: '' },
  });

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: AdminLoginValues) => {
    setServerError(null);

    await authClient.signIn.username(
      { username: values.staffId, password: values.password },
      {
        onSuccess: async () => {
          const result = await verifyRRAStaff();

          if (!result.success) {
            await authClient.signOut();
            setServerError(result.error);
            return;
          }

          router.push('/admin/dashboard');
        },
        onError: (ctx: { error: { message: string } }) => {
          setServerError(ctx.error.message);
        },
      },
    );
  };

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <Card className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-md">
        {/* ── Card Header: RRA badge + title ─────────────────── */}
        <div className="border-b border-gray-100 bg-white px-8 py-5 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-bold tracking-widest text-gray-900 uppercase">RRA Staff Portal</span>
          </div>
          <p className="text-sm font-medium text-gray-500 tracking-wide">Authorized personnel only</p>
        </div>

        {/* ── Form fields ─────────────────────────────────────── */}
        <CardContent className="px-8 py-6 space-y-5 bg-white">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Server error banner */}
              {serverError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {serverError}
                </div>
              )}

              <FormField
                control={form.control}
                name="staffId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700">Staff ID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your Staff ID"
                        className="h-10 border-gray-200 bg-gray-50 focus:bg-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-sm font-semibold text-gray-700">Password</FormLabel>
                      <Link href="/forgot-password" className="text-xs text-blue-500 hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input {...field} type="password" className="h-10 border-gray-200 bg-gray-50 focus:bg-white" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-10 bg-gray-900 text-white hover:bg-gray-800"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : 'Access Dashboard'}
              </Button>
            </form>
          </Form>

          {/* ── Footer note ──────────────────────────────────── */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 justify-center">
              <span className="h-px flex-1 bg-gray-100" />
              <span className="text-xs text-gray-400 font-medium">RRA Internal</span>
              <span className="h-px flex-1 bg-gray-100" />
            </div>

            <p className="text-center text-xs text-gray-400 leading-relaxed">
              This portal is for authorized Rwanda Revenue Authority staff.
              <br />
              Unauthorized access is strictly prohibited.
            </p>

            <p className="text-center text-sm text-gray-500">
              Are you a taxpayer?{' '}
              <Link href="/sign-in" className="font-medium text-blue-500 hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
