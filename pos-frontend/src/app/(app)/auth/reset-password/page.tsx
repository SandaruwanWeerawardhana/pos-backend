"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.resetPassword(token.trim(), password);
      showToast("Password updated — sign in with your new password", "success");
      router.replace(ROUTES.auth.login);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't reset the password. Request a new link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-on-surface dark:text-zinc-50">
          Choose a new password
        </h1>
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          Reset links are single-use and expire 30 minutes after being sent.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        {/* Shown as an editable field so a user who copied the code out of an
            email (rather than clicking through) can still complete the flow. */}
        <Input
          label="Reset code"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
          autoFocus={!token}
        />
        <Input
          label="New password"
          type="password"
          revealToggle
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoFocus={Boolean(token)}
        />
        <Input
          label="Confirm new password"
          type="password"
          revealToggle
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          error={error}
          required
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          className="mt-2 rounded-full"
          disabled={submitting || !token || !password}
        >
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>

      <Link
        href={ROUTES.auth.forgotPassword}
        className="text-center text-sm font-medium text-primary hover:underline dark:text-blue-400"
      >
        Request a new link
      </Link>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary so this route can still be
  // statically prerendered.
  return (
    <Suspense
      fallback={
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          Loading…
        </p>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
