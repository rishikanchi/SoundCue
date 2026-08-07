import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { SignUpForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthScreen
      description="Save your screenings and see how your results change over time."
      title="Create your SoundCue account."
    >
      <SignUpForm />
    </AuthScreen>
  );
}
