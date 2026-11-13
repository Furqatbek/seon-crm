import { z } from "zod";

// Messages are keys under auth.errors in messages/*.json.
export const signInSchema = z.object({
  email: z.email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("emailInvalid"),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "passwordTooShort"),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "passwordMismatch",
    path: ["confirm"],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export type AuthErrorKey =
  | "emailInvalid"
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordMismatch"
  | "invalidCredentials"
  | "linkInvalid"
  | "notConfigured"
  | "generic";

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorKey };
