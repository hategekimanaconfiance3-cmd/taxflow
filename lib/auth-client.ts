import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, inferAdditionalFields, phoneNumberClient, usernameClient } from 'better-auth/client/plugins';
import type { auth } from '@/lib/auth';

export const authClient = createAuthClient({
  plugins: [usernameClient(), phoneNumberClient(), emailOTPClient(), inferAdditionalFields<typeof auth>()],
});
