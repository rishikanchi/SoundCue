import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { SignUpForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthScreen
      description="Save your Parkinson’s voice screenings and see how comparable results change over time."
      title="Create your SoundCue account."
    >
      <SignUpForm />
    </AuthScreen>
  );
}
