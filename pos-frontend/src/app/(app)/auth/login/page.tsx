"use client";

import { Suspense, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

type LoginMode = "account" | "till";

const MODES: { value: LoginMode; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "till", label: "Cashier PIN" },
];

function LoginForm() {
  const [mode, setMode] = useState<LoginMode>("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, loginStaff } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  // RequireAuth appends ?reason=expired when it ends a stale session, so the
  // user is told why they landed back here rather than left guessing.
  const sessionExpired = searchParams.get("reason") === "expired";
  const tillMode = mode === "till";

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      router.push(ROUTES.dashboard);
    } catch {
      showToast("Login failed — check email and password", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // Till staff live only in the local tables, so this resolves offline and
  // lands on the terminal instead of the dashboard.
  async function handleTillSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const staff = await loginStaff(email, pin);
      router.replace(staff.posOnly ? ROUTES.pos.root : ROUTES.dashboard);
    } catch {
      setPin("");
      showToast("Email or PIN is not recognised", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-on-surface dark:text-zinc-50">
          Welcome back
        </h1>
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          {tillMode
            ? "Sign in with your till PIN to open the terminal."
            : "Sign in to reach your dashboard."}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Sign-in method"
        className="flex gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {MODES.map((option) => {
          const selected = option.value === mode;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setMode(option.value);
                setPassword("");
                setPin("");
              }}
              className={`min-h-9 flex-1 rounded-lg text-sm font-semibold transition-colors ${
                selected
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {sessionExpired && (
        <p
          role="status"
          className="rounded-lg border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
        >
          Your session expired. Sign in again to continue.
        </p>
      )}

      <form
        onSubmit={tillMode ? handleTillSubmit : handleSubmit}
        className="flex w-full flex-col gap-4"
      >
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
        {tillMode ? (
          <Input
            label="Till PIN"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            revealToggle
            maxLength={6}
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            hint="4 to 6 digits, set by your manager."
            required
          />
        ) : (
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            revealToggle
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        )}
        {!tillMode && (
          <Link
            href={ROUTES.auth.forgotPassword}
            className="-mt-1 self-end text-xs font-medium text-primary hover:underline dark:text-blue-400"
          >
            Forgot password?
          </Link>
        )}
        <Button
          type="submit"
          size="lg"
          fullWidth
          className="mt-1 rounded-full"
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
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
      <LoginForm />
    </Suspense>
  );
}
