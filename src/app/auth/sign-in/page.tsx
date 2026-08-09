import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { SignInForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthScreen
      description="Return to your private Parkinson’s voice screenings, trends, and clinician reports."
      title="Welcome back."
    >
      <SignInForm />
    </AuthScreen>
  );
}
