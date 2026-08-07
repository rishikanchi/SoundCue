import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthScreen
      description="We sent a confirmation link to the email address you provided."
      title="Check your email."
    >
      <div style={{ marginTop: 32, maxWidth: 520 }}>
        <MailCheck aria-hidden="true" size={44} strokeWidth={1.4} />
        <p className="muted" style={{ marginTop: 20 }}>
          Open the link in the message to verify your account. You’ll return here and continue
          to your screening.
        </p>
        <Link className="text-link" href="/auth/sign-in" style={{ display: "inline-block", marginTop: 26 }}>
          Return to sign in
        </Link>
      </div>
    </AuthScreen>
  );
}
