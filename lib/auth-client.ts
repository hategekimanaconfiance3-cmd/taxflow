import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [usernameClient(), phoneNumberClient(), emailOTPClient()],
});
