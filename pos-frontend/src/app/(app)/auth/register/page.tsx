"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

export default function RegisterPage() {
  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await register(ownerName, businessName, email, password, businessType);
      router.push(ROUTES.dashboard);
    } catch {
      showToast("Registration failed — check your details", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-on-surface dark:text-zinc-50">
          Create an account
        </h1>
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          Sign up and get started in seconds.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <Input
          label="Owner name"
          type="text"
          value={ownerName}
          onChange={(event) => setOwnerName(event.target.value)}
          required
          autoFocus
        />
        <Input
          label="Business name"
          type="text"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          required
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="businessType"
            className="text-sm font-medium text-on-surface-variant dark:text-zinc-300"
          >
            Business type
          </label>
          <select
            id="businessType"
            value={businessType}
            onChange={(event) => setBusinessType(event.target.value)}
            required
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-secondary focus:ring-2 focus:ring-primary/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="" disabled>
              Select business type
            </option>
            <option value="grocery">Grocery</option>
            <option value="bookshop">Bookshop</option>
          </select>
        </div>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          revealToggle
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full rounded-full"
          disabled={submitting}
        >
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
