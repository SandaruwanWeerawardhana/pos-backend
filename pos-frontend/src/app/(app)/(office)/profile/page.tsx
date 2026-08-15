"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { KeyRound, LogOut, ShieldCheck, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const MIN_PASSWORD_LENGTH = 8;

export default function ProfilePage() {
  const { user, expiresAt, updateProfile, changePassword, logout } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // The store rehydrates from localStorage after first paint, so the form is
  // seeded in an effect rather than from an initial-state read that would be
  // empty on mount.
  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setBusinessName(user.businessName);
  }, [user]);

  async function handleProfileSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({ name, email, businessName });
      showToast("Profile updated", "success");
    } catch (caught) {
      showToast(
        caught instanceof Error ? caught.message : "Failed to update profile",
        "error",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmation) {
      setPasswordError("The two passwords don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("The new password must differ from the current one.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      showToast("Password changed", "success");
    } catch (caught) {
      setPasswordError(
        caught instanceof Error ? caught.message : "Failed to change password",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  function handleSignOut() {
    logout();
    router.replace(ROUTES.auth.login);
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Your sign-in details and password for this workspace."
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "My profile" },
        ]}
        actions={
          <Button type="button" variant="outline" onClick={handleSignOut}>
            <LogOut size={16} />
            Sign out
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Profile details" />
          <form onSubmit={handleProfileSubmit} className="mt-4 flex flex-col gap-4">
            <Input
              label="Full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              label="Business name"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            <Button type="submit" disabled={savingProfile || !name || !email}>
              <UserCog size={16} />
              {savingProfile ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader title="Change password" />
            <form
              id="password"
              onSubmit={handlePasswordSubmit}
              className="mt-4 flex flex-col gap-4"
            >
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                revealToggle
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                revealToggle
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                revealToggle
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                error={passwordError}
                required
              />
              <Button
                type="submit"
                disabled={
                  savingPassword || !currentPassword || !newPassword || !confirmation
                }
              >
                <KeyRound size={16} />
                {savingPassword ? "Updating…" : "Change password"}
              </Button>
            </form>
          </Card>

          <Card>
            <SectionHeader title="Session" />
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant dark:text-zinc-400">
                  Business type
                </dt>
                <dd className="font-medium capitalize text-on-surface dark:text-zinc-100">
                  {user?.businessType ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant dark:text-zinc-400">
                  Session expires
                </dt>
                <dd className="font-medium text-on-surface dark:text-zinc-100">
                  {expiresAt ? formatDateTime(expiresAt) : "Not set"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 flex items-start gap-2 text-xs text-on-surface-variant dark:text-zinc-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
              You are signed out automatically once the session expires. Sales
              already recorded on this device stay saved locally either way.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
