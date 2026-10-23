import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import db from '@/db/drizzle';
import { user, session, account, verification } from '@/db/schema';

// Ensure BETTER_AUTH_SECRET is set
if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = 'b3yX7U2Kp4mR8tQ1vL9wH6sD5nN2cF8k';
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  plugins: [
    username({
      usernameValidator: (u) => /^[a-zA-Z0-9._-]{3,30}$/.test(u),
    }),
  ],
  user: {
    additionalFields: {
      nationalId: { type: 'string', required: false },
      tinNumber: { type: 'string', required: false },
      businessName: { type: 'string', required: false },
      role: { type: 'string', required: false },
      businessType: { type: 'string', required: false, defaultValue: 'registered_business' },
      clearanceStatus: { type: 'string', required: false, defaultValue: 'pending' },
      isActive: { type: 'boolean', required: false, defaultValue: true },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
