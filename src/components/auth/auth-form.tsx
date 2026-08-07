"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn, UserRound } from "lucide-react";
import {
  requestPasswordReset,
  signIn,
  signInWithGoogle,
  signUp,
  updatePassword,
} from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/auth/schemas";
import styles from "./auth.module.css";

const initialState: AuthFormState = {};
const googleAuthEnabled =
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.length ? (
    <p className={styles.fieldError} role="alert">
      {messages[0]}
    </p>
  ) : null;
}

function PasswordField({
  error,
  confirm = false,
}: {
  error?: string[];
  confirm?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = confirm ? "confirm-password" : "password";
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{confirm ? "Confirm password" : "Password"}</label>
      <div className={styles.passwordInput}>
        <input
          autoComplete={confirm ? "new-password" : "current-password"}
          id={id}
          name={confirm ? "confirmPassword" : "password"}
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((value) => !value)}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {confirm ? null : <p className={styles.helper}>Use at least 8 characters.</p>}
      <FieldError messages={error} />
    </div>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initialState);
  return (
    <>
      <form action={action} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="email">Email address</label>
          <input autoComplete="email" id="email" name="email" required type="email" />
          <FieldError messages={state.errors?.email} />
        </div>
        <PasswordField error={state.errors?.password} />
        <PasswordField confirm error={state.errors?.confirmPassword} />
        {state.message ? <p className={styles.formMessage}>{state.message}</p> : null}
        <button className="button button--primary" disabled={pending} type="submit">
          <UserRound aria-hidden="true" size={22} />
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      {googleAuthEnabled ? (
        <>
          <SocialDivider />
          <GoogleButton />
        </>
      ) : null}
      <p className={styles.switchPrompt}>
        Already have an account? <Link href="/auth/sign-in">Sign in.</Link>
      </p>
    </>
  );
}

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <>
      <form action={action} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="email">Email address</label>
          <input autoComplete="email" id="email" name="email" required type="email" />
          <FieldError messages={state.errors?.email} />
        </div>
        <PasswordField error={state.errors?.password} />
        <Link className={styles.forgotLink} href="/auth/forgot-password">
          Forgot password?
        </Link>
        {state.message ? <p className={styles.formMessage}>{state.message}</p> : null}
        <button className="button button--primary" disabled={pending} type="submit">
          <LogIn aria-hidden="true" size={22} />
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {googleAuthEnabled ? (
        <>
          <SocialDivider />
          <GoogleButton />
        </>
      ) : null}
      <p className={styles.switchPrompt}>
        New to SoundCue? <Link href="/auth/sign-up">Create account.</Link>
      </p>
    </>
  );
}

function SocialDivider() {
  return (
    <div className={styles.divider} aria-hidden="true">
      <span /> <small>or</small> <span />
    </div>
  );
}

function GoogleButton() {
  return (
    <form action={signInWithGoogle}>
      <button className={`button button--secondary ${styles.googleButton}`} type="submit">
        <span className={styles.googleG} aria-hidden="true">
          G
        </span>
        Continue with Google
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="email">Email address</label>
        <input autoComplete="email" id="email" name="email" required type="email" />
        <FieldError messages={state.errors?.email} />
      </div>
      {state.message ? <p className={styles.successMessage}>{state.message}</p> : null}
      <button className="button button--primary" disabled={pending} type="submit">
        {pending ? "Sending link…" : "Send reset link"}
      </button>
      <Link className={styles.forgotLink} href="/auth/sign-in">
        Return to sign in
      </Link>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);
  return (
    <form action={action} className={styles.form}>
      <PasswordField error={state.errors?.password} />
      {state.message ? <p className={styles.formMessage}>{state.message}</p> : null}
      <button className="button button--primary" disabled={pending} type="submit">
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
