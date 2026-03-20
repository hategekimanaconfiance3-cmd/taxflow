import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { phoneNumberClient } from "better-auth/client/plugins";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    plugins: [usernameClient(), phoneNumberClient(), emailOTPClient()],
});
