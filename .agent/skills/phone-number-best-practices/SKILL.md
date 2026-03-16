---
name: phone-number-best-practices
description: This skill provides guidance and enforcement rules for implementing phone number authentication and OTP verification using Better Auth's phoneNumber plugin.
---

## Phone Number Plugin Setup

The phone number plugin extends Better Auth by allowing users to sign in/up using their phone number with OTP verification.

### Server Config

```ts
import { betterAuth } from "better-auth"
import { phoneNumber } from "better-auth/plugins"

const auth = betterAuth({
    plugins: [
        phoneNumber({
            sendOTP: ({ phoneNumber, code }, ctx) => {
                // Implement sending OTP code via SMS
                // WARNING: Do NOT await this — it slows requests and enables timing attacks
                // On serverless, use waitUntil() instead
            },
            otpLength: 6, // default
            expiresIn: 300, // seconds, default 5 minutes
            allowedAttempts: 3, // brute-force protection, default 3
        })
    ]
})
```

### Client Config

```ts
import { createAuthClient } from "better-auth/client"
import { phoneNumberClient } from "better-auth/client/plugins"

const authClient = createAuthClient({
    plugins: [
        phoneNumberClient()
    ]
})
```

### Database Migration

After adding the plugin, run migrations to add required fields:

```bash
pnpm dlx @better-auth/cli generate  # for Drizzle
# then
pnpm db:push  # or drizzle-kit push
```

## Schema Requirements

The plugin adds 2 fields to the `user` table:

| Field | Type | Description |
|-------|------|-------------|
| `phoneNumber` | `string` (unique, optional) | The user's phone number |
| `phoneNumberVerified` | `boolean` (default: false, optional) | Whether the phone number is verified |

## Usage

### Send OTP

**Client:**
```ts
const { data, error } = await authClient.phoneNumber.sendOtp({
    phoneNumber: "+250788000001",
});
```

**Server:**
```ts
const data = await auth.api.sendPhoneNumberOTP({
    body: { phoneNumber: "+250788000001" }
});
```

### Verify Phone Number

**Client:**
```ts
const { data, error } = await authClient.phoneNumber.verify({
    phoneNumber: "+250788000001",
    code: "123456",
    disableSession: false, // optional
    updatePhoneNumber: false, // optional — set true to change an existing user's number
});
```

**Server:**
```ts
const data = await auth.api.verifyPhoneNumber({
    body: {
        phoneNumber: "+250788000001",
        code: "123456",
    }
});
```

### Sign Up with Phone Number

Enable `signUpOnVerification` to let users register via phone:

```ts
phoneNumber({
    sendOTP: ({ phoneNumber, code }, ctx) => { /* ... */ },
    signUpOnVerification: {
        getTempEmail: (phoneNumber) => `${phoneNumber}@taxflow.rw`,
        getTempName: (phoneNumber) => phoneNumber,
    }
})
```

If you have additional required user fields, pass them in the verify body:

```ts
await authClient.phoneNumber.verify({
    phoneNumber: "+250788000001",
    code: "123456",
    role: "manufacturer", // additional field
})
```

### Sign In with Phone Number + Password

```ts
const { data, error } = await authClient.signIn.phoneNumber({
    phoneNumber: "+250788000001",
    password: "secure-password",
    rememberMe: true, // optional
});
```

### Update Phone Number (Logged-in User)

1. Send OTP to new number:
```ts
await authClient.phoneNumber.sendOtp({ phoneNumber: "+250788999999" })
```

2. Verify with `updatePhoneNumber: true`:
```ts
await authClient.phoneNumber.verify({
    phoneNumber: "+250788999999",
    code: "123456",
    updatePhoneNumber: true,
})
```

### Password Reset via Phone

**Request reset:**
```ts
await authClient.phoneNumber.requestPasswordReset({
    phoneNumber: "+250788000001",
});
```

**Reset password:**
```ts
await authClient.phoneNumber.resetPassword({
    otp: "123456",
    phoneNumber: "+250788000001",
    newPassword: "new-secure-password",
});
```

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `otpLength` | `number` | `6` | Length of OTP code |
| `sendOTP` | `function` | required | Sends OTP via SMS |
| `expiresIn` | `number` | `300` | OTP expiry in seconds |
| `allowedAttempts` | `number` | `3` | Max verification attempts before OTP is deleted |
| `callbackOnVerification` | `function` | optional | Called after phone verification |
| `sendPasswordResetOTP` | `function` | optional | Sends OTP for password reset |
| `phoneNumberValidator` | `function` | optional | Custom phone validation |
| `verifyOTP` | `function` | optional | Custom OTP verification (e.g., Twilio Verify) |
| `signUpOnVerification` | `object` | optional | Enable sign-up via phone |
| `requireVerification` | `boolean` | optional | Block sign-in until phone is verified |

## Security Notes

- **Never await `sendOTP`** — it enables timing attacks. Use fire-and-forget or `waitUntil`.
- **Brute-force protection**: After `allowedAttempts` exceeded, OTP is deleted. User gets 403 and must request a new code.
- When using `requireVerification: true`, unverified sign-in attempts return 401 (`PHONE_NUMBER_NOT_VERIFIED`) and auto-trigger OTP send.
