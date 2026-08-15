"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { Check, HelpCircle, X } from "lucide-react";
import { PIN_PATTERN, listRoles, listWarehouses } from "@/lib/db";
import type { Role, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface UserFormValues {
  first_name: string;
  last_name: string;
  username: string;
  phone: string;
  email: string;
  role_id: string;
  avatar: string;
  view_all_records: boolean;
  /** Empty means every warehouse, including ones added later. */
  warehouse_ids: string[];
  all_warehouses: boolean;
  /** Create: the new PIN. Edit: blank leaves the existing PIN alone. */
  password: string;
}

export const EMPTY_USER_FORM: UserFormValues = {
  first_name: "",
  last_name: "",
  username: "",
  phone: "",
  email: "",
  role_id: "",
  avatar: "",
  view_all_records: false,
  warehouse_ids: [],
  all_warehouses: true,
  password: "",
};

interface UserFormProps {
  mode: "create" | "edit";
  initialValues: UserFormValues;
  onSubmit: (values: UserFormValues) => Promise<void>;
  onCancel: () => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function RequiredLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children} <span className="text-error">*</span>
    </>
  );
}

function HelpHint({ text }: Readonly<{ text: string }>) {
  return (
    <span
      title={text}
      className="inline-flex cursor-help text-primary dark:text-blue-400"
    >
      <HelpCircle size={14} aria-label={text} />
    </span>
  );
}

function PermissionPanel({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="rounded-t-xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface dark:bg-zinc-800/60 dark:text-zinc-100">
        {title}
      </h2>
      <div className="flex flex-col gap-2 p-4">{children}</div>
    </section>
  );
}

// One form behind both /users/new and /users/[id]: the two screens differ only
// in whether the password is mandatory, so keeping them as one component stops
// a field added to create from quietly going missing on edit.
export function UserForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: Readonly<UserFormProps>) {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [values, setValues] = useState<UserFormValues>(initialValues);
  const [avatarName, setAvatarName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [roleList, warehouseList] = await Promise.all([
        listRoles(),
        listWarehouses(),
      ]);
      setRoles(roleList);
      setWarehouses(warehouseList);
    })();
  }, []);

  function set<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleAvatarChange(file: File | undefined) {
    if (!file) {
      set("avatar", "");
      setAvatarName("");
      return;
    }
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setErrors((current) => ({
        ...current,
        avatar: "Use a JPG, PNG or WebP image.",
      }));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setErrors((current) => ({
        ...current,
        avatar: "Image must be under 2 MB.",
      }));
      return;
    }
    setErrors((current) => ({ ...current, avatar: "" }));
    set("avatar", await readAsDataUrl(file));
    setAvatarName(file.name);
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!values.first_name.trim()) next.first_name = "First name is required.";
    if (!values.last_name.trim()) next.last_name = "Last name is required.";
    if (!values.username.trim()) next.username = "Username is required.";
    if (!values.phone.trim()) next.phone = "Phone is required.";
    if (!values.email.trim()) next.email = "Email is required.";
    if (!values.role_id) next.role_id = "Pick a role.";
    // The password doubles as the till PIN, so it has to satisfy the same
    // 4-6 digit rule the PIN keypad can enter. On edit, blank means "keep the
    // current one" and is only checked once something has been typed.
    if (mode === "create" || values.password) {
      if (!PIN_PATTERN.test(values.password)) next.password = "Use 4 to 6 digits.";
    }
    if (!values.all_warehouses && values.warehouse_ids.length === 0) {
      next.warehouses = "Pick at least one warehouse, or allow all.";
    }
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await onSubmit(values);
    } catch (caught) {
      setErrors({
        submit: caught instanceof Error ? caught.message : "Failed to save user",
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleWarehouse(id: string) {
    setValues((current) => ({
      ...current,
      warehouse_ids: current.warehouse_ids.includes(id)
        ? current.warehouse_ids.filter((warehouseId) => warehouseId !== id)
        : [...current.warehouse_ids, id],
    }));
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="first_name"
          label={<RequiredLabel>First Name</RequiredLabel>}
          placeholder="First Name"
          value={values.first_name}
          onChange={(event) => set("first_name", event.target.value)}
          error={errors.first_name}
          autoFocus
        />
        <Input
          name="last_name"
          label={<RequiredLabel>Last Name</RequiredLabel>}
          placeholder="Last Name"
          value={values.last_name}
          onChange={(event) => set("last_name", event.target.value)}
          error={errors.last_name}
        />
        <Input
          name="username"
          label={<RequiredLabel>Username</RequiredLabel>}
          placeholder="Username"
          autoComplete="off"
          value={values.username}
          onChange={(event) => set("username", event.target.value)}
          error={errors.username}
        />
        <Input
          name="phone"
          label={<RequiredLabel>Phone</RequiredLabel>}
          placeholder="Phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(event) => set("phone", event.target.value)}
          error={errors.phone}
        />
        <Input
          name="email"
          label={<RequiredLabel>Email</RequiredLabel>}
          placeholder="Email"
          type="email"
          autoComplete="off"
          value={values.email}
          onChange={(event) => set("email", event.target.value)}
          error={errors.email}
        />
        <Select
          name="role_id"
          label={<RequiredLabel>Role</RequiredLabel>}
          placeholder="Please Select"
          value={values.role_id}
          onChange={(event) => set("role_id", event.target.value)}
          options={roles.map((role) => ({ value: role.id, label: role.name }))}
          error={errors.role_id}
        />

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-on-surface-variant dark:text-zinc-300">
            User Image
          </span>
          <div className="flex items-center gap-3">
            {values.avatar && (
              <Image
                src={values.avatar}
                alt=""
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept={ACCEPTED_AVATAR_TYPES.join(",")}
              aria-label="User image"
              onChange={(event) =>
                void handleAvatarChange(event.target.files?.[0])
              }
              className="min-h-10 w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface-variant outline-none file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-container file:px-3 file:py-1.5 file:text-sm file:text-on-surface hover:border-outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-100"
            />
            {values.avatar && (
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => {
                  set("avatar", "");
                  setAvatarName("");
                  if (avatarInputRef.current) avatarInputRef.current.value = "";
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-error/40 text-error transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-error/10 active:scale-90"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {errors.avatar ? (
            <span className="animate-fade-in text-xs text-error">
              {errors.avatar}
            </span>
          ) : (
            <span className="text-xs text-on-surface-variant dark:text-zinc-500">
              {avatarName || "No file chosen"} · JPG, PNG or WebP, under 2 MB.
            </span>
          )}
        </div>

        <Input
          name="password"
          label={
            mode === "create" ? (
              <RequiredLabel>Password</RequiredLabel>
            ) : (
              "New Password"
            )
          }
          placeholder={
            mode === "create"
              ? "Password"
              : "Please leave this field blank if you haven't changed it"
          }
          type="password"
          inputMode="numeric"
          maxLength={6}
          revealToggle
          autoComplete="new-password"
          value={values.password}
          onChange={(event) =>
            set("password", event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          error={errors.password}
          hint="4 to 6 digits — this is the till sign-in PIN."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PermissionPanel title="View all records of all Users">
          <label className="flex items-center gap-2 text-sm text-on-surface dark:text-zinc-100">
            <input
              type="checkbox"
              checked={values.view_all_records}
              onChange={(event) => set("view_all_records", event.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            View all records of all Users
            <HelpHint text="Allow user to view all records, not just their own" />
          </label>
          <p className="text-xs text-on-surface-variant dark:text-zinc-500">
            Allow user to view all records, not just their own
          </p>
        </PermissionPanel>

        <PermissionPanel title="Access warehouses">
          <label className="flex items-center gap-2 text-sm text-on-surface dark:text-zinc-100">
            <input
              type="checkbox"
              checked={values.all_warehouses}
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  all_warehouses: event.target.checked,
                  warehouse_ids: event.target.checked ? [] : current.warehouse_ids,
                }));
              }}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            All Warehouses
            <HelpHint text="Grants access to every warehouse, including ones added later" />
          </label>

          {!values.all_warehouses && (
            <div className="animate-fade-in flex flex-col gap-2 pl-1">
              {warehouses.length === 0 ? (
                <p className="text-xs text-on-surface-variant dark:text-zinc-500">
                  No warehouses yet. Leave &ldquo;All Warehouses&rdquo; ticked.
                </p>
              ) : (
                warehouses.map((warehouse) => (
                  <label
                    key={warehouse.id}
                    className="flex items-center gap-2 text-sm text-on-surface dark:text-zinc-100"
                  >
                    <input
                      type="checkbox"
                      checked={values.warehouse_ids.includes(warehouse.id)}
                      onChange={() => toggleWarehouse(warehouse.id)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                    {warehouse.name}
                  </label>
                ))
              )}
              {errors.warehouses && (
                <span className="animate-fade-in text-xs text-error">
                  {errors.warehouses}
                </span>
              )}
            </div>
          )}
        </PermissionPanel>
      </div>

      {errors.submit && (
        <p className="text-sm text-error" role="alert">
          {errors.submit}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving}>
          <Check size={16} />
          Submit
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
