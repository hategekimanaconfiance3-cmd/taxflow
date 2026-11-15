import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, inferAdditionalFields, phoneNumberClient, usernameClient } from 'better-auth/client/plugins';
import type { auth } from './auth';

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), usernameClient(), phoneNumberClient(), emailOTPClient()],
});
