'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff, ShieldCheck, AlertTriangle, User, Building2 } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { validateId } from '@/lib/actions/auth.action';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';

// ---------------------------------------------------------------------------
// Role Selector (shared pill-button style)
// ---------------------------------------------------------------------------

const ROLES = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'retailer', label: 'Retailer' },
] as const;

type Role = (typeof ROLES)[number]['value'];
type RoleOrNull = Role | null;
const BUSINESS_TYPES = [
  { value: 'registered_business', label: 'Registered business' },
  { value: 'institution', label: 'Institution' },
  { value: 'government', label: 'Government' },
  { value: 'large_bulk_buyer', label: 'Large / bulk buyer' },
] as const;

function RoleSelector({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: RoleOrNull;
  onChange: (r: Role) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  return (
    <div className={`flex justify-center gap-2 rounded-lg p-1 ${hasError ? 'ring-2 ring-red-300' : ''}`}>
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const step1Schema = z.object({
  nationalId: z.string().regex(/^\d{16}$/, 'National ID must be exactly 16 digits'),
});

const step1ManualSchema = z.object({
  nationalId: z.string().regex(/^\d{16}$/, 'National ID must be exactly 16 digits'),
  tinNumber: z.string().min(9, 'TIN must be at least 9 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  businessName: z.string().optional(),
  phoneNumber: z.string().min(10, 'Phone number is required'),
});

const step2Schema = z
  .object({
    email: z.string().email('Enter a valid email address').or(z.literal('')).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const step3Schema = z.object({
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step1ManualValues = z.infer<typeof step1ManualSchema>;
type Step2Values = z.infer<typeof step2Schema>;
type Step3Values = z.infer<typeof step3Schema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type IdStatus = 'idle' | 'checking' | 'valid' | 'valid_no_tin' | 'invalid' | 'unavailable';

function maskNid(nid: string): string {
  if (nid.length !== 16) return nid;
  return nid.slice(0, 4) + '••••••••' + nid.slice(12);
}

// ---------------------------------------------------------------------------
// Verified Identity Card
// ---------------------------------------------------------------------------

function VerifiedIdentityCard({
  firstName,
  lastName,
  dateOfBirth,
  gender,
  district,
  province,
  tin,
  businessName,
  businessType,
  phone,
  email,
  address,
  hasTin,
}: {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  district: string | null;
  province: string | null;
  tin: string | null;
  businessName: string | null;
  businessType: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  hasTin: boolean;
}) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Identity Verified</span>
      </div>

      {/* Personal identity */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Personal</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-5 text-sm">
          <span className="text-gray-500 text-xs">First name</span>
          <span className="font-medium text-gray-800 text-xs">{firstName}</span>
          <span className="text-gray-500 text-xs">Last name</span>
          <span className="font-medium text-gray-800 text-xs">{lastName}</span>
          {dateOfBirth && (
            <>
              <span className="text-gray-500 text-xs">Date of birth</span>
              <span className="font-medium text-gray-800 text-xs">{dateOfBirth}</span>
            </>
          )}
          {gender && (
            <>
              <span className="text-gray-500 text-xs">Gender</span>
              <span className="font-medium text-gray-800 text-xs">{gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : gender}</span>
            </>
          )}
          {(district || province) && (
            <>
              <span className="text-gray-500 text-xs">Location</span>
              <span className="font-medium text-gray-800 text-xs">{[district, province].filter(Boolean).join(', ')}</span>
            </>
          )}
        </div>
      </div>

      {/* Business / TIN */}
      {hasTin && (
        <>
          <div className="border-t border-green-200" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Business (RRA Registry)</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-5 text-sm">
              {tin && (
                <>
                  <span className="text-gray-500 text-xs">TIN</span>
                  <span className="font-medium text-gray-800 text-xs font-mono">{tin}</span>
                </>
              )}
              {businessName && (
                <>
                  <span className="text-gray-500 text-xs">Business name</span>
                  <span className="font-medium text-gray-800 text-xs">{businessName}</span>
                </>
              )}
              {businessType && (
                <>
                  <span className="text-gray-500 text-xs">Type</span>
                  <span className="font-medium text-gray-800 text-xs capitalize">{businessType.replace(/_/g, ' ')}</span>
                </>
              )}
              {phone && (
                <>
                  <span className="text-gray-500 text-xs">Phone</span>
                  <span className="font-medium text-gray-800 text-xs">{phone}</span>
                </>
              )}
              {email && (
                <>
                  <span className="text-gray-500 text-xs">Email</span>
                  <span className="font-medium text-gray-800 text-xs">{email}</span>
                </>
              )}
              {address && (
                <>
                  <span className="text-gray-500 text-xs">Address</span>
                  <span className="font-medium text-gray-800 text-xs">{address}</span>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* No TIN warning */}
      {!hasTin && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Identity confirmed — but no RRA business registration was found for this National ID. You will need to provide your TIN and business details manually.
        </p>
      )}

      <p className="text-[10px] text-gray-400 leading-tight">
        Information retrieved from the government identity and RRA business registries. Review it carefully before continuing.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Unavailable Banner
// ---------------------------------------------------------------------------

function ServiceUnavailableBanner({ onUseManual }: { onUseManual: () => void }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-xs font-semibold text-amber-700">Verification Service Unavailable</span>
      </div>
      <p className="text-xs text-amber-700 leading-relaxed">
        The identity verification service is temporarily unavailable. You can enter your details manually — your account will be held for manual review before activation.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUseManual}
        className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
      >
        Enter details manually
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignUpForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<RoleOrNull>(null);
  const [businessType, setBusinessType] = useState<(typeof BUSINESS_TYPES)[number]['value']>('registered_business');
  const [isManualMode, setIsManualMode] = useState(false);

  // Role enforcement
  const [roleError, setRoleError] = useState('');

  // ID lookup results
  const [idStatus, setIdStatus] = useState<IdStatus>('idle');
  const [idError, setIdError] = useState<string>('');

  // Verified identity fields
  const [verifiedFirstName, setVerifiedFirstName] = useState('');
  const [verifiedLastName, setVerifiedLastName] = useState('');
  const [verifiedDob, setVerifiedDob] = useState<string | null>(null);
  const [verifiedGender, setVerifiedGender] = useState<string | null>(null);
  const [verifiedDistrict, setVerifiedDistrict] = useState<string | null>(null);
  const [verifiedProvince, setVerifiedProvince] = useState<string | null>(null);
  // Business fields
  const [resolvedName, setResolvedName] = useState('');
  const [resolvedTin, setResolvedTin] = useState('');
  const [resolvedBusiness, setResolvedBusiness] = useState('');
  const [resolvedBusinessType, setResolvedBusinessType] = useState<string | null>(null);
  const [resolvedPhone, setResolvedPhone] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [resolvedTinDistrict, setResolvedTinDistrict] = useState<string | null>(null);
  const [hasTin, setHasTin] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP 10-min countdown (in seconds)
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Forms ----
  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { nationalId: '' },
    mode: 'onChange',
  });

  const formManual = useForm<Step1ManualValues>({
    resolver: zodResolver(step1ManualSchema),
    defaultValues: { nationalId: '', tinNumber: '', fullName: '', businessName: '', phoneNumber: '' },
  });

  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const form3 = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: { otp: '' },
  });

  // ---------------------------------------------------------------------------
  // Reset resolved data
  // ---------------------------------------------------------------------------

  function clearResolved() {
    setVerifiedFirstName('');
    setVerifiedLastName('');
    setVerifiedDob(null);
    setVerifiedGender(null);
    setVerifiedDistrict(null);
    setVerifiedProvince(null);
    setResolvedName('');
    setResolvedTin('');
    setResolvedBusiness('');
    setResolvedBusinessType(null);
    setResolvedPhone('');
    setResolvedEmail(null);
    setResolvedAddress(null);
    setResolvedTinDistrict(null);
    setHasTin(false);
    setIdError('');
  }

  // ---------------------------------------------------------------------------
  // Live ID validation (debounced)
  // ---------------------------------------------------------------------------

  const watchedId = form1.watch('nationalId');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    clearResolved();

    if (!watchedId) {
      setIdStatus('idle');
      return;
    }

    if (!/^\d{16}$/.test(watchedId)) {
      setIdStatus('invalid');
      setIdError('Invalid National ID');
      return;
    }

    // Exactly 16 digits — trigger API check
    setIdStatus('checking');
    debounceRef.current = setTimeout(async () => {
      const result = await validateId(watchedId);
      if (result.success) {
        setIdStatus(result.hasTin ? 'valid' : 'valid_no_tin');
        setVerifiedFirstName(result.firstName);
        setVerifiedLastName(result.lastName);
        setResolvedName(result.name);
        setVerifiedDob(result.dateOfBirth);
        setVerifiedGender(result.gender);
        setVerifiedDistrict(result.district);
        setVerifiedProvince(result.province);
        setResolvedTin(result.tin ?? '');
        setResolvedBusiness(result.businessName ?? '');
        setResolvedBusinessType(result.businessType);
        setResolvedPhone(result.phone);
        setResolvedEmail(result.email);
        setResolvedAddress(result.address);
        setResolvedTinDistrict(result.tinDistrict);
        setHasTin(result.hasTin);
      } else {
        const isUnavailable = result.code === 'service_unavailable';
        setIdStatus(isUnavailable ? 'unavailable' : 'invalid');
        setIdError(result.error);
      }
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleContinueToStep2 = () => {
    if (!role) {
      setRoleError('Please select your role before continuing');
      return;
    }
    if (idStatus === 'valid' || idStatus === 'valid_no_tin') setStep(2);
  };

  const handleManualContinue = (values: Step1ManualValues) => {
    if (!role) {
      setRoleError('Please select your role before continuing');
      return;
    }
    setResolvedName(values.fullName);
    setResolvedTin(values.tinNumber);
    setResolvedBusiness(values.businessName ?? '');
    setResolvedPhone(values.phoneNumber);
    setHasTin(true);
    setStep(2);
  };

  const handleCreateAccountAndSendOtp = async (_values: Step2Values) => {
    const step1Values = isManualMode ? formManual.getValues() : form1.getValues();
    const nid = isManualMode ? step1Values.nationalId : (form1.getValues().nationalId);
    const finalEmail = _values.email || (resolvedTin ? `${resolvedTin}@taxflow.local` : undefined);
    if (!finalEmail) {
      form2.setError('email', { message: 'Email is required when no TIN is on file.' });
      return;
    }

    const signUpResult = await authClient.signUp.email(
      {
        email: finalEmail,
        password: _values.password,
        name: resolvedName,
        username: resolvedTin || nid,
        nationalId: nid,
        tinNumber: resolvedTin,
        businessName: resolvedBusiness,
        phoneNumber: resolvedPhone,
        role,
        businessType,
      },
      {
        onError: (ctx: { error: { message: string } }) => {
          form2.setError('email', { message: ctx.error.message });
        },
      },
    );

    if (!signUpResult?.data) return;

    if (!resolvedPhone) {
      // No phone on file — skip OTP, go to dashboard
      router.push('/dashboard');
      return;
    }

    try {
      const { error } = await authClient.phoneNumber.sendOtp({
        phoneNumber: resolvedPhone,
      });
      if (error) {
        form3.setError('otp', { message: error.message ?? 'Failed to send OTP' });
        return;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setOtpSecondsLeft(5 * 60);
      timerRef.current = setInterval(() => {
        setOtpSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
      setStep(3);
    } catch {
      form3.setError('otp', { message: 'Failed to send OTP' });
    }
  };

  const handleVerifyPhone = async (values: Step3Values) => {
    const { error: verifyError } = await authClient.phoneNumber.verify({
      phoneNumber: resolvedPhone,
      code: values.otp,
    });

    if (verifyError) {
      form3.setError('otp', { message: verifyError.message ?? 'Invalid OTP. Please try again.' });
      return;
    }

    router.push('/dashboard');
  };

  const stepLabel = step === 1 ? 'Verify Business' : step === 2 ? 'Account Details' : 'Verification';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <Card className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-md">
        {/* ── Card Header: step indicator + role selector ─────── */}
        <div className="border-b border-gray-100 bg-white px-8 py-5 text-center space-y-4">
          <p className="text-sm font-medium text-gray-500 tracking-wide">{stepLabel}</p>
          <RoleSelector
            value={role}
            onChange={(r) => {
              setRole(r);
              setRoleError('');
            }}
            disabled={step > 1}
            hasError={!!roleError}
          />
          {step === 1 && (
            <label className="mx-auto flex max-w-xs flex-col gap-1 text-left text-xs text-gray-500">
              Business / buyer type
              <select
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value as typeof businessType)}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-800"
              >
                {BUSINESS_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          )}
          {roleError && <p className="text-xs text-red-500 font-medium">{roleError}</p>}
        </div>

        <CardContent className="space-y-4 pt-0">
          {/* ================================================================
              STEP 1 — ID → verified identity card (auto-fetched) OR manual
          ================================================================ */}
          {step === 1 && !isManualMode && (
            <div className="space-y-4">
              {/* National ID */}
              <Form {...form1}>
                <form className="space-y-4">
                  <FormField
                    control={form1.control}
                    name="nationalId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>National ID</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              placeholder="Enter 16-digit National ID"
                              maxLength={16}
                              inputMode="numeric"
                              onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 16))}
                              className="pr-10 h-10 border-gray-200 tracking-wider font-mono"
                            />
                            {/* Status icon */}
                            {idStatus === 'checking' && (
                              <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-gray-400" />
                            )}
                            {(idStatus === 'valid' || idStatus === 'valid_no_tin') && (
                              <CheckCircle2 className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />
                            )}
                            {(idStatus === 'invalid' || idStatus === 'unavailable') && (
                              <XCircle className="absolute right-3 top-2.5 h-5 w-5 text-red-500" />
                            )}
                          </div>
                        </FormControl>

                        {/* Digit counter while typing */}
                        {watchedId && watchedId.length < 16 && idStatus !== 'checking' && (
                          <p className="text-xs text-gray-400 pl-0.5">{watchedId.length}/16 digits</p>
                        )}

                        {/* Error */}
                        {idStatus === 'invalid' && idError && (
                          <p className="text-xs text-red-500 pl-0.5">{idError}</p>
                        )}
                      </FormItem>
                    )}
                  />
                </form>
              </Form>

              {/* Service unavailable banner */}
              {idStatus === 'unavailable' && (
                <ServiceUnavailableBanner onUseManual={() => setIsManualMode(true)} />
              )}

              {/* Verified identity card */}
              {(idStatus === 'valid' || idStatus === 'valid_no_tin') && (
                <VerifiedIdentityCard
                  firstName={verifiedFirstName}
                  lastName={verifiedLastName}
                  dateOfBirth={verifiedDob}
                  gender={verifiedGender}
                  district={verifiedDistrict}
                  province={verifiedProvince}
                  tin={resolvedTin || null}
                  businessName={resolvedBusiness || null}
                  businessType={resolvedBusinessType}
                  phone={resolvedPhone}
                  email={resolvedEmail}
                  address={resolvedAddress}
                  hasTin={hasTin}
                />
              )}

              {/* When no TIN: show read-only TIN/business placeholders */}
              {idStatus !== 'valid' && idStatus !== 'valid_no_tin' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">TIN Number</label>
                    <div className="h-10 flex items-center rounded-md border border-dashed border-gray-200 bg-transparent px-3 text-sm text-gray-300">
                      Auto-filled from National ID
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Business Name</label>
                    <div className="h-10 flex items-center rounded-md border border-dashed border-gray-200 bg-transparent px-3 text-sm text-gray-300">
                      Auto-filled from TIN
                    </div>
                  </div>
                </>
              )}

              <Button
                onClick={handleContinueToStep2}
                disabled={idStatus !== 'valid' && idStatus !== 'valid_no_tin'}
                className="w-full border border-gray-200 bg-white text-black shadow-sm hover:bg-gray-50"
              >
                Continue
              </Button>
            </div>
          )}

          {/* ================================================================
              STEP 1 — Manual entry fallback (service unavailable)
          ================================================================ */}
          {step === 1 && isManualMode && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Manual verification mode — your account will require review by a TaxFlow officer before it is activated. All details you enter must match your official documents.
                </p>
              </div>

              <Form {...formManual}>
                <form onSubmit={formManual.handleSubmit(handleManualContinue)} className="space-y-3">
                  <FormField
                    control={formManual.control}
                    name="nationalId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>National ID *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="16-digit National ID"
                            maxLength={16}
                            inputMode="numeric"
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 16))}
                            className="h-10 border-gray-200 font-mono tracking-wider"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={formManual.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="As on your National ID" className="h-10 border-gray-200" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={formManual.control}
                    name="tinNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TIN Number *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Your RRA TIN" className="h-10 border-gray-200 font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={formManual.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Registered business name (optional)" className="h-10 border-gray-200" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={formManual.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="+250 7..." className="h-10 border-gray-200" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsManualMode(false)}
                      className="h-10 w-1/3 border-gray-200"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="h-10 w-2/3 border border-gray-200 bg-white text-black shadow-sm hover:bg-gray-50"
                    >
                      Continue
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}

          {/* ================================================================
              STEP 2 — Phone (auto) / Email / Password
          ================================================================ */}
          {step === 2 && (
            <Form {...form2}>
              <form onSubmit={form2.handleSubmit(handleCreateAccountAndSendOtp)} className="space-y-4">
                {/* Verified identity summary (compact) */}
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-semibold text-gray-700">{resolvedName}</span>
                  </div>
                  {resolvedTin && (
                    <p className="text-xs text-gray-500 pl-5">TIN: <span className="font-mono">{resolvedTin}</span></p>
                  )}
                  {resolvedBusiness && (
                    <p className="text-xs text-gray-500 pl-5">{resolvedBusiness}</p>
                  )}
                </div>

                {/* Phone — read-only, auto-fetched from TIN */}
                {resolvedPhone && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Phone Number</label>
                    <div className="h-10 flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                      {resolvedPhone}
                    </div>
                    <p className="text-xs text-gray-400 pl-0.5">Linked to your TIN — used for OTP verification</p>
                  </div>
                )}

                {/* Email — optional or required when no phone */}
                <FormField
                  control={form2.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Email {resolvedPhone ? <span className="text-gray-400 font-normal">(Optional)</span> : <span className="text-red-500">*</span>}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder={resolvedPhone ? 'For notifications' : 'Required — no phone on file'}
                          className="h-10 border-gray-200"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password */}
                <FormField
                  control={form2.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showPassword ? 'text' : 'password'}
                            className="h-10 border-gray-200 pr-10"
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

                {/* Confirm Password */}
                <FormField
                  control={form2.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showConfirmPassword ? 'text' : 'password'}
                            className="h-10 border-gray-200 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            tabIndex={-1}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="h-10 w-1/3 border-gray-200"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={form2.formState.isSubmitting}
                    className="h-10 w-2/3 border border-gray-200 bg-white text-black shadow-sm hover:bg-gray-50"
                  >
                    {form2.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'Create Account'}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* ================================================================
              STEP 3 — OTP
          ================================================================ */}
          {step === 3 && (
            <Form {...form3}>
              <form onSubmit={form3.handleSubmit(handleVerifyPhone)} className="space-y-6">
                {/* Header */}
                <div className="text-center space-y-1">
                  <p className="text-sm text-gray-600">
                    We sent a 6-digit code to <span className="font-semibold text-gray-800">{resolvedPhone}</span>
                  </p>
                  {/* Countdown */}
                  <p
                    className={`text-xs font-medium ${
                      otpSecondsLeft === 0 ? 'text-red-500' : otpSecondsLeft <= 60 ? 'text-amber-500' : 'text-gray-400'
                    }`}
                  >
                    {otpSecondsLeft === 0
                      ? 'OTP expired — go back and resend'
                      : `Expires in ${Math.floor(otpSecondsLeft / 60)}:${String(otpSecondsLeft % 60).padStart(2, '0')}`}
                  </p>
                </div>

                {/* OTP Input — 3 | separator | 3 */}
                <FormField
                  control={form3.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem className="flex flex-col items-center">
                      <FormControl>
                        <InputOTP
                          maxLength={6}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={otpSecondsLeft === 0}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (timerRef.current) clearInterval(timerRef.current);
                      setStep(2);
                    }}
                    className="h-10 w-1/3 border-gray-200"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={form3.formState.isSubmitting || otpSecondsLeft === 0}
                    className="h-10 w-2/3 border border-gray-200 bg-white text-black shadow-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {form3.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'Verify & Register'}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          <p className="pt-2 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-medium text-blue-500 hover:text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role Selector (shared pill-button style)
// ---------------------------------------------------------------------------

const ROLES = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'retailer', label: 'Retailer' },
] as const;

type Role = (typeof ROLES)[number]['value'];
type RoleOrNull = Role | null;
const BUSINESS_TYPES = [
  { value: 'registered_business', label: 'Registered business' },
  { value: 'institution', label: 'Institution' },
  { value: 'government', label: 'Government' },
  { value: 'large_bulk_buyer', label: 'Large / bulk buyer' },
] as const;

function RoleSelector({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: RoleOrNull;
  onChange: (r: Role) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  return (
    <div className={`flex justify-center gap-2 rounded-lg p-1 ${hasError ? 'ring-2 ring-red-300' : ''}`}>
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const step1Schema = z.object({
  nationalId: z.string().regex(/^\d{16}$/, 'National ID must be exactly 16 digits'),
});

const step2Schema = z
  .object({
    email: z.string().email('Enter a valid email address').or(z.literal('')).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const step3Schema = z.object({
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;
type Step3Values = z.infer<typeof step3Schema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type IdStatus = 'idle' | 'checking' | 'valid' | 'invalid';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignUpForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<RoleOrNull>(null);
  const [businessType, setBusinessType] = useState<(typeof BUSINESS_TYPES)[number]['value']>('registered_business');

  // Role enforcement
  const [roleError, setRoleError] = useState('');

  // ID lookup results
  const [idStatus, setIdStatus] = useState<IdStatus>('idle');
  const [idError, setIdError] = useState<string>('');
  const [resolvedName, setResolvedName] = useState('');
  const [resolvedTin, setResolvedTin] = useState('');
  const [resolvedBusiness, setResolvedBusiness] = useState('');
  const [resolvedPhone, setResolvedPhone] = useState('');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP 10-min countdown (in seconds)
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Forms ----
  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { nationalId: '' },
    mode: 'onChange',
  });

  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const form3 = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: { otp: '' },
  });

  // ---------------------------------------------------------------------------
  // Live ID validation (debounced)
  // ---------------------------------------------------------------------------

  const watchedId = form1.watch('nationalId');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Reset resolved data on every change
    setResolvedName('');
    setResolvedTin('');
    setResolvedBusiness('');
    setResolvedPhone('');
    setIdError('');

    // Empty — stay idle, no icon
    if (!watchedId) {
      setIdStatus('idle');
      return;
    }

    // Typed something that doesn't match 16-digit pattern — invalid immediately
    if (!/^\d{16}$/.test(watchedId)) {
      setIdStatus('invalid');
      setIdError('Invalid National ID');
      return;
    }

    // Exactly 16 digits — trigger API check
    setIdStatus('checking');
    debounceRef.current = setTimeout(async () => {
      const result = await validateId(watchedId);
      if (result.success) {
        setIdStatus('valid');
        setResolvedName(result.name);
        setResolvedTin(result.tin);
        setResolvedBusiness(result.businessName);
        setResolvedPhone(result.phone);
      } else {
        setIdStatus('invalid');
        setIdError(result.error);
      }
    }, 600);
  }, [watchedId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleContinueToStep2 = () => {
    if (!role) {
      setRoleError('Please select your role before continuing');
      return;
    }
    if (idStatus === 'valid') setStep(2);
  };

  const handleCreateAccountAndSendOtp = async (_values: Step2Values) => {
    const step1Values = form1.getValues();
    const finalEmail = _values.email || `${resolvedTin}@taxflow.local`;

    // Step A: Create the account first (so the user exists for phone verification)
    const signUpResult = await authClient.signUp.email(
      {
        email: finalEmail,
        password: _values.password,
        name: resolvedName,
        username: resolvedTin,
        nationalId: step1Values.nationalId,
        tinNumber: resolvedTin,
        businessName: resolvedBusiness,
        phoneNumber: resolvedPhone,
        role,
        businessType,
      },
      {
        onError: (ctx: { error: { message: string } }) => {
          form2.setError('email', { message: ctx.error.message });
        },
      },
    );

    if (!signUpResult?.data) return;

    // Step B: Send OTP to the phone number for verification
    try {
      const { error } = await authClient.phoneNumber.sendOtp({
        phoneNumber: resolvedPhone,
      });
      if (error) {
        form3.setError('otp', { message: error.message ?? 'Failed to send OTP' });
        return;
      }
      // Start 5-minute countdown (matches plugin's expiresIn: 300)
      if (timerRef.current) clearInterval(timerRef.current);
      setOtpSecondsLeft(5 * 60);
      timerRef.current = setInterval(() => {
        setOtpSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
      setStep(3);
    } catch {
      form3.setError('otp', { message: 'Failed to send OTP' });
    }
  };

  const handleVerifyPhone = async (values: Step3Values) => {
    // Verify OTP — plugin finds the user by phone and sets phoneNumberVerified = true
    const { error: verifyError } = await authClient.phoneNumber.verify({
      phoneNumber: resolvedPhone,
      code: values.otp,
    });

    if (verifyError) {
      form3.setError('otp', { message: verifyError.message ?? 'Invalid OTP. Please try again.' });
      return;
    }

    // Phone verified — redirect to dashboard
    router.push('/dashboard');
  };

  const stepLabel = step === 1 ? 'Verify Business' : step === 2 ? 'Account Details' : 'Verification';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex w-full flex-col items-center justify-center">
      <Card className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-md">
        {/* ── Card Header: step indicator + role selector ─────── */}
        <div className="border-b border-gray-100 bg-white px-8 py-5 text-center space-y-4">
          <p className="text-sm font-medium text-gray-500 tracking-wide">{stepLabel}</p>
          <RoleSelector
            value={role}
            onChange={(r) => {
              setRole(r);
              setRoleError('');
            }}
            disabled={step > 1}
            hasError={!!roleError}
          />
          {step === 1 && (
            <label className="mx-auto flex max-w-xs flex-col gap-1 text-left text-xs text-gray-500">
              Business / buyer type
              <select
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value as typeof businessType)}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-800"
              >
                {BUSINESS_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          )}
          {roleError && <p className="text-xs text-red-500 font-medium">{roleError}</p>}
        </div>

        <CardContent className="space-y-4 pt-0">
          {/* ================================================================
              STEP 1 — ID → Name / TIN / Business (auto-fetched)
          ================================================================ */}
          {step === 1 && (
            <div className="space-y-4">
              {/* National ID */}
              <Form {...form1}>
                <form className="space-y-4">
                  <FormField
                    control={form1.control}
                    name="nationalId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>National ID</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              placeholder="Enter 16-digit National ID"
                              maxLength={16}
                              className="pr-10 h-10 border-gray-200 tracking-wider"
                            />
                            {/* Status icon */}
                            {idStatus === 'checking' && (
                              <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-gray-400" />
                            )}
                            {idStatus === 'valid' && (
                              <CheckCircle2 className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />
                            )}
                            {idStatus === 'invalid' && (
                              <XCircle className="absolute right-3 top-2.5 h-5 w-5 text-red-500" />
                            )}
                          </div>
                        </FormControl>

                        {/* Resolved name */}
                        {resolvedName && <p className="text-xs text-gray-400 font-medium pl-0.5">{resolvedName}</p>}

                        {/* Error from lookup */}
                        {idStatus === 'invalid' && idError && <p className="text-xs text-red-500 pl-0.5">{idError}</p>}
                      </FormItem>
                    )}
                  />
                </form>
              </Form>

              {/* TIN — read-only, auto-populated */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">TIN Number</label>
                <div
                  className={`h-10 flex items-center rounded-md border px-3 text-sm transition-colors ${
                    resolvedTin
                      ? 'border-gray-200 bg-gray-50 text-gray-700'
                      : 'border-dashed border-gray-200 bg-transparent text-gray-300'
                  }`}
                >
                  {resolvedTin || 'Auto-filled from National ID'}
                </div>
              </div>

              {/* Business Name — read-only, auto-populated */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Business Name</label>
                <div
                  className={`h-10 flex items-center rounded-md border px-3 text-sm transition-colors ${
                    resolvedBusiness
                      ? 'border-gray-200 bg-gray-50 text-gray-700'
                      : 'border-dashed border-gray-200 bg-transparent text-gray-300'
                  }`}
                >
                  {resolvedBusiness || 'Auto-filled from TIN'}
                </div>
              </div>

              <Button
                onClick={handleContinueToStep2}
                disabled={idStatus !== 'valid' || !role}
                className="w-full border border-gray-200 bg-white text-black shadow-sm hover:bg-gray-50"
              >
                Continue
              </Button>
            </div>
          )}

          {/* ================================================================
              STEP 2 — Phone (auto) / Email / Password
          ================================================================ */}
          {step === 2 && (
            <Form {...form2}>
              <form onSubmit={form2.handleSubmit(handleCreateAccountAndSendOtp)} className="space-y-4">
                {/* Phone — read-only, auto-fetched from TIN */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Phone Number</label>
                  <div className="h-10 flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                    {resolvedPhone}
                  </div>
                  <p className="text-xs text-gray-400 pl-0.5">Linked to your TIN — used for OTP verification</p>
                </div>

                {/* Email — optional */}
                <FormField
                  control={form2.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Email <span className="text-gray-400 font-normal">(Optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="For notifications"
                          className="h-10 border-gray-200"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password */}
                <FormField
                  control={form2.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showPassword ? 'text' : 'password'}
                            className="h-10 border-gray-200 pr-10"
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

                {/* Confirm Password */}
                <FormField
                  control={form2.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showConfirmPassword ? 'text' : 'password'}
                            className="h-10 border-gray-200 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            tabIndex={-1}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="h-10 w-1/3 border-gray-200"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={form2.formState.isSubmitting}
                    className="h-10 w-2/3 border border-gray-200 bg-white text-black shadow-sm hover:bg-gray-50"
                  >
                    {form2.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'Create Account'}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* ================================================================
              STEP 3 — OTP
          ================================================================ */}
          {step === 3 && (
            <Form {...form3}>
              <form onSubmit={form3.handleSubmit(handleVerifyPhone)} className="space-y-6">
                {/* Header */}
                <div className="text-center space-y-1">
                  <p className="text-sm text-gray-600">
                    We sent a 6-digit code to <span className="font-semibold text-gray-800">{resolvedPhone}</span>
                  </p>
                  {/* Countdown */}
                  <p
                    className={`text-xs font-medium ${
                      otpSecondsLeft === 0 ? 'text-red-500' : otpSecondsLeft <= 60 ? 'text-amber-500' : 'text-gray-400'
                    }`}
                  >
                    {otpSecondsLeft === 0
                      ? 'OTP expired — go back and resend'
                      : `Expires in ${Math.floor(otpSecondsLeft / 60)}:${String(otpSecondsLeft % 60).padStart(2, '0')}`}
                  </p>
                </div>

                {/* OTP Input — 3 | separator | 3 */}
                <FormField
                  control={form3.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem className="flex flex-col items-center">
                      <FormControl>
                        <InputOTP
                          maxLength={6}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={otpSecondsLeft === 0}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (timerRef.current) clearInterval(timerRef.current);
                      setStep(2);
                    }}
                    className="h-10 w-1/3 border-gray-200"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={form3.formState.isSubmitting || otpSecondsLeft === 0}
                    className="h-10 w-2/3 border border-gray-200 bg-white text-black shadow-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {form3.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'Verify & Register'}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          <p className="pt-2 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-medium text-blue-500 hover:text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
