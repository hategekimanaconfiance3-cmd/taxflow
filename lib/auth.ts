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

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await resend.emails.send({
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
        await resend.emails.send({
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
      sendOTP: ({ phoneNumber, code }) => {
        // Mock: log OTP to console for development
        // In production, integrate with an SMS provider (e.g., Twilio, Africa's Talking)
        console.log(`📱 OTP for ${phoneNumber}: ${code}`);
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
          await resend.emails.send({
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
      clearanceStatus: {
        type: 'string',
        required: false,
        defaultValue: 'approved',
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
