'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Loader2, Eye, EyeOff } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// ---------------------------------------------------------------------------
// Role Selector
// ---------------------------------------------------------------------------

const ROLES = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'retailer', label: 'Retailer' },
] as const;

type Role = (typeof ROLES)[number]['value'];
type RoleOrNull = Role | null;

function RoleSelector({
  value,
  onChange,
  disabled,
}: {
  value: RoleOrNull;
  onChange: (r: Role) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-center gap-2">
      {ROLES.map((r) => (
        <button
          key={r.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r.value)}
          className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors
                        ${
                          value === r.value
                            ? 'border-[#99a1af] bg-gray-200 text-black'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-[#99a1af] hover:text-[#99a1af]'
                        }
                        disabled:pointer-events-none disabled:opacity-60`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  tin: z
    .string()
    .min(9, 'TIN must be at least 9 digits')
    .max(10, 'TIN must be at most 10 digits')
    .regex(/^\d+$/, 'TIN must contain only digits'),
  password: z.string().min(1, 'Password is required'),
});

type SignInValues = z.infer<typeof signInSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignInForm() {
  const router = useRouter();
  const [role, setRole] = useState<RoleOrNull>(null);
  const [roleError, setRoleError] = useState('');
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { tin: '', password: '' },
  });

  const isSubmitting = form.formState.isSubmitting;

  const handleRoleChange = (r: Role) => {
    setRole(r);
    setRoleError('');
  };

  const onSubmit = async (values: SignInValues) => {
    setAuthError('');
    setRoleError('');

    if (!role) {
      setRoleError('Please select your role to continue');
      return;
    }

    try {
      await authClient.signIn.username(
        { username: values.tin.trim(), password: values.password },
        {
          onSuccess: async () => {
            try {
              const { data: session, error: sessionError } = await authClient.getSession();
              if (sessionError || !session?.user) {
                setAuthError('Sign-in could not be completed. Please try again.');
                return;
              }

              const userRole = (session.user as Record<string, unknown>).role as string | undefined;
              if (userRole && userRole !== role) {
                await authClient.signOut();
                setRoleError(`Your account is registered as a ${userRole}. Please select the correct role.`);
                return;
              }

              router.replace('/dashboard');
            } catch (error) {
              console.error('Sign-in session verification failed', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
              });
              setAuthError('Sign-in is temporarily unavailable. Please try again shortly.');
            }
          },
          onError: (ctx) => {
            const status = ctx.error.status;
            setAuthError(
              status === 429
                ? 'Too many sign-in attempts. Please wait a moment and try again.'
                : status !== undefined && status >= 500
                  ? 'Sign-in is temporarily unavailable. Please try again shortly.'
                  : 'Invalid TIN or password.',
            );
          },
        },
      );
    } catch (error) {
      console.error('Sign-in request failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      setAuthError('Sign-in is temporarily unavailable. Please try again shortly.');
    }
  };

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <Card className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-md">
        {/* ── Card Header: title + role selector ─────────────── */}
        <div className="border-b border-gray-100 bg-white px-8 py-5 text-center space-y-4">
          <p className="text-sm font-medium text-gray-500 tracking-wide">Sign in to continue</p>
          <RoleSelector value={role} onChange={handleRoleChange} />
          {roleError && <p className="text-xs text-red-500 font-medium mt-1">{roleError}</p>}
        </div>

        {/* ── Form fields ─────────────────────────────────────── */}
        <CardContent className="px-8 py-6 space-y-5 bg-white">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="tin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700">TIN Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your TIN"
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
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          className="h-10 border-gray-200 bg-gray-50 focus:bg-white pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
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
                {isSubmitting ? <Loader2 className="animate-spin" /> : 'Sign in'}
              </Button>
              {authError && (
                <p role="alert" aria-live="polite" className="text-sm text-red-600">
                  {authError}
                </p>
              )}
            </form>
          </Form>

          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" className="font-medium text-blue-500 hover:underline">
              Register your business
            </Link>
          </p>
          <p className="text-center text-xs text-gray-400">
            RRA Staff?{' '}
            <Link href="/admin-login" className="font-medium text-gray-500 hover:underline hover:text-gray-700">
              Login here
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
