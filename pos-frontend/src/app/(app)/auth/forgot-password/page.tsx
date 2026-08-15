"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { apiClient } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/types/routes";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await apiClient.requestPasswordReset(email);
      setDevToken(result.devToken ?? null);
      setSent(true);
    } catch {
      setError("We couldn't start the reset just now. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex w-full flex-col gap-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#004b1e] text-[#bbf7d0]">
          <MailCheck size={20} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-on-surface dark:text-zinc-50">
            Check your email
          </h1>
          {/* Deliberately does not confirm whether the address is registered:
              a different message per case would leak which emails have accounts. */}
          <p className="text-sm text-on-surface-variant dark:text-zinc-400">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a
            link to reset the password. It expires in 30 minutes.
          </p>
        </div>

        {devToken && (
          <div className="rounded-xl border border-dashed border-outline-variant p-3 text-xs dark:border-zinc-700">
            <p className="font-semibold text-on-surface dark:text-zinc-200">
              Development mode
            </p>
            <p className="mt-1 text-on-surface-variant dark:text-zinc-400">
              No mail server is configured, so the token is shown here:
            </p>
            <Link
              href={`${ROUTES.auth.resetPassword}?token=${devToken}`}
              className="mt-2 block break-all font-mono text-primary hover:underline dark:text-blue-400"
            >
              {devToken}
            </Link>
          </div>
        )}

        <Link
          href={ROUTES.auth.login}
          className="text-sm font-medium text-primary hover:underline dark:text-blue-400"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-on-surface dark:text-zinc-50">
          Forgot your password?
        </h1>
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          Enter the email on your account and we&apos;ll send a reset link.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
          required
          autoFocus
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          className="mt-2 rounded-full"
          disabled={submitting || !email}
        >
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link
        href={ROUTES.auth.login}
        className="text-center text-sm font-medium text-primary hover:underline dark:text-blue-400"
      >
        Back to sign in
      </Link>
    </div>
  );
}
