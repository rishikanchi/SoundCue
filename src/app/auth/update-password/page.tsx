import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/auth/auth-form";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Choose a new password" };

export default function UpdatePasswordPage() {
  return (
    <AuthScreen
      description="Choose a new password with at least 8 characters."
      title="Choose a new password."
    >
      <UpdatePasswordForm />
    </AuthScreen>
  );
}
