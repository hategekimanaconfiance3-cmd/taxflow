import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { phoneNumber } from 'better-auth/plugins';
import db from '@/db/drizzle';
import * as schema from '@/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  plugins: [
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
