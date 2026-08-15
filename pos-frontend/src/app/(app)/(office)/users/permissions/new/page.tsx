"use client";

import { useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createRole } from "@/lib/db";
import type { Permission } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionPicker } from "@/components/ui/PermissionPicker";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

type FormSubmitEvent = Parameters<
  NonNullable<ComponentProps<"form">["onSubmit"]>
>[0];

export default function CreatePermissionPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Role name is required.";

    if (permissions.length === 0) {
      found.permissions = "Pick at least one permission.";
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await createRole({ name, description, permissions });
      showToast("Role created", "success");
      router.push(ROUTES.users.permissions);
    } catch (error_) {
      setErrors({
        submit:
          error_ instanceof Error ? error_.message : "Failed to create role",
      });
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Create Permission"
        breadcrumbs={[
          { label: "Users", href: ROUTES.users.root },
          { label: "Group Permissions", href: ROUTES.users.permissions },
          { label: "Create Permission" },
        ]}
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-6 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="name"
            label={
              <>
                Role <span className="text-error">*</span>
              </>
            }
            placeholder="Enter Role Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            autoFocus
          />
          <Input
            name="description"
            label="Role Description"
            placeholder="Enter Role Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <PermissionPicker
          value={permissions}
          onChange={setPermissions}
          error={errors.permissions}
        />

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
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(ROUTES.users.permissions)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
