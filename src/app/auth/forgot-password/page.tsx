import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/auth-form";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthScreen
      backHref="/auth/sign-in"
      backLabel="Back to sign in"
      description="Enter your email and we’ll send a secure link to choose a new password."
      title="Reset your password."
    >
      <ForgotPasswordForm />
    </AuthScreen>
  );
}
