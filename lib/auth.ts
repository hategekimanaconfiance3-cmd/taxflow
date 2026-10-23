import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { phoneNumber } from 'better-auth/plugins';
import { emailOTP } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import db from '@/db/drizzle';
import * as schema from '@/db/schema';
import { Resend } from 'resend';
import TaxFlowEmail from '@/components/resend/email-ui';

// Ensure BETTER_AUTH_SECRET is available — fall back to a dev default so auth
// doesn't crash if the env var is missing in the deployment.
if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = 'b3yX7U2Kp4mR8tQ1vL9wH6sD5nN2cF8k';
  if (process.env.NODE_ENV === 'production') {
    console.warn('[TaxFlow] WARNING: BETTER_AUTH_SECRET env var is not set. Using fallback. Add it to Vercel env vars.');
  }
}

// Initialize Resend lazily to avoid crashing if RESEND_API_KEY is not set in production
const getResend = () => new Resend(process.env.RESEND_API_KEY ?? 're_placeholder');

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: 'database',
    modelName: 'rateLimit',
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-in/username': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
      '/email-otp/send-verification-otp': { window: 300, max: 3 },
      '/email-otp/verify-email': { window: 300, max: 5 },
      '/phone-number/send-otp': { window: 300, max: 3 },
      '/phone-number/verify': { window: 300, max: 5 },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Do not require email verification for staff portal logins
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await getResend().emails.send({
          from: 'TaxFlow <onboarding@resend.dev>',
          to: user.email,
          subject: 'Reset your TaxFlow password',
          react: TaxFlowEmail({
            subject: 'Reset your TaxFlow password',
            actionUrl: url,
            actionText: 'Reset Password',
          }),
        });
      } catch (error) {
        console.error('Failed to send password reset email:', error);
      }
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await getResend().emails.send({
          from: 'TaxFlow <onboarding@resend.dev>',
          to: user.email,
          subject: 'Verify your TaxFlow email',
          react: TaxFlowEmail({
            subject: 'Verify your TaxFlow email',
            actionUrl: url,
            actionText: 'Verify Email',
          }),
        });
      } catch (error) {
        console.error('Failed to send verification email:', error);
      }
    },
  },
  plugins: [
    nextCookies(),
    username({
      usernameValidator: (username) => {
        // Allow alphanumeric, hyphens, underscores, and dots (for RRA staff IDs like SA-001)
        return /^[a-zA-Z0-9._-]{3,30}$/.test(username);
      },
    }),
    phoneNumber({
      sendOTP: () => {
        // Never log authentication codes. Configure a delivery provider to enable this flow.
        throw new Error('Phone OTP delivery is not configured.');
      },
      otpLength: 6,
      expiresIn: 300, // 5 minutes
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        let subject: string;

        if (type === 'sign-in') {
          subject = 'Your secure sign-in code';
        } else if (type === 'email-verification') {
          subject = 'Verify your email for TaxFlow';
        } else {
          subject = 'TaxFlow verification code';
        }

        try {
          await getResend().emails.send({
            from: 'TaxFlow <onboarding@resend.dev>',
            to: email,
            subject,
            react: TaxFlowEmail({ verificationCode: otp, subject }),
          });
        } catch (error) {
          console.error('Failed to send verification OTP:', error);
          throw error;
        }
      },
    }),
  ],
  user: {
    additionalFields: {
      nationalId: {
        type: 'string',
        required: false,
      },
      tinNumber: {
        type: 'string',
        required: false,
      },
      businessName: {
        type: 'string',
        required: false,
      },
      role: {
        type: 'string',
        required: false,
      },
      businessType: {
        type: 'string',
        required: false,
        defaultValue: 'registered_business',
      },
      clearanceStatus: {
        type: 'string',
        required: false,
        defaultValue: 'pending', // New traders start as pending — RRA staff must approve
      },
      isActive: {
        type: 'boolean',
        required: false,
        defaultValue: true,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
