"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search, X } from "lucide-react";
import {
  ADMIN_ROLE_ID,
  createRole,
  deleteRole,
  listRoles,
  listStaffUsers,
  updateRole,
} from "@/lib/db";
import { type Permission, type Role } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionPicker } from "@/components/ui/PermissionPicker";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

export default function GroupPermissionsPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Role | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPermissions, setFormPermissions] = useState<Permission[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  async function refresh() {
    const [roleList, staff] = await Promise.all([listRoles(), listStaffUsers()]);
    const counts: Record<string, number> = {};
    for (const user of staff) {
      counts[user.role_id] = (counts[user.role_id] ?? 0) + 1;
    }
    setRoles(roleList);
    setMemberCounts(counts);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visibleRoles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return roles;
    return roles.filter((role) =>
      `${role.name} ${role.description ?? ""}`.toLowerCase().includes(term),
    );
  }, [roles, search]);

  function openEdit(role: Role) {
    setEditTarget(role);
    setFormName(role.name);
    setFormDescription(role.description ?? "");
    setFormPermissions([...role.permissions]);
    setFormError("");
    setEditorOpen(true);
  }

  async function handleSave() {
    setFormError("");
    if (!formName.trim()) {
      setFormError("Role name is required.");
      return;
    }
    if (formPermissions.length === 0) {
      setFormError("Pick at least one permission.");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await updateRole(editTarget.id, {
          name: formName,
          description: formDescription,
          permissions: formPermissions,
        });
        showToast("Role updated", "success");
      } else {
        await createRole({
          name: formName,
          description: formDescription,
          permissions: formPermissions,
        });
        showToast("Role created", "success");
      }
      setEditorOpen(false);
      await refresh();
    } catch (error_) {
      setFormError(
        error_ instanceof Error ? error_.message : "Failed to save role",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteRole(pendingDelete.id);
      showToast("Role deleted", "success");
      await refresh();
    } catch (error_) {
      showToast(
        error_ instanceof Error ? error_.message : "Failed to delete role",
        "error",
      );
    } finally {
      setPendingDelete(null);
    }
  }

  // Admin is fixed at every permission so an install cannot lock itself out of
  // this screen; its name and checkboxes are shown read-only.
  const adminLocked = editTarget?.id === ADMIN_ROLE_ID;
  const nameLocked = Boolean(editTarget?.is_system);

  const roleColumns: DataColumn<Role>[] = [
    {
      key: "name",
      header: "Role",
      sortValue: (role) => role.name,
      render: (role) => (
        <span className="font-medium text-on-surface dark:text-zinc-100">
          {role.name}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      sortValue: (role) => role.description ?? "",
      render: (role) => (
        <span className="text-primary dark:text-blue-400">
          {role.description || `${role.name} Permissions`}
        </span>
      ),
    },
    {
      key: "members",
      header: "Members",
      hideOnMobile: true,
      align: "right",
      sortValue: (role) => memberCounts[role.id] ?? 0,
      render: (role) => memberCounts[role.id] ?? 0,
    },
    {
      key: "actions",
      header: "Action",
      render: (role) => (
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Edit ${role.name}`}
            onClick={() => openEdit(role)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-600/30 text-emerald-600 transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-emerald-50 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            <Pencil size={14} />
          </button>
          {/* Built-in roles have no delete control at all, matching how the
              rest of the app hides actions it would only refuse. */}
          {!role.is_system && (
            <button
              type="button"
              aria-label={`Delete ${role.name}`}
              onClick={() => setPendingDelete(role)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-error/40 text-error transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-error/10 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X size={14} />
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Group Permissions"
        breadcrumbs={[
          { label: "Users", href: ROUTES.users.root },
          { label: "Group Permissions" },
        ]}
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-zinc-500"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this table"
              aria-label="Search roles"
              className="min-h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-3 text-sm text-on-surface outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-on-surface-variant focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
          </div>
          <Link
            href={ROUTES.users.permissionsNew}
            className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-secondary px-3 py-1.5 text-xs font-medium text-on-secondary transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-secondary/90 hover:shadow-elevated active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus size={15} />
            Create
          </Link>
        </div>

        <DataTable
          columns={roleColumns}
          rows={visibleRoles}
          rowKey={(role) => role.id}
          emptyMessage="No roles match this search."
          caption="Roles"
          pageSizeOptions={[10, 25, 50]}
        />
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editTarget ? `Edit ${editTarget.name}` : "Role"}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Role"
            value={formName}
            onChange={(event) => setFormName(event.target.value)}
            disabled={nameLocked}
            hint={nameLocked ? "Built-in roles keep their name." : undefined}
            autoFocus
          />
          <Input
            label="Description"
            value={formDescription}
            onChange={(event) => setFormDescription(event.target.value)}
            placeholder={`${formName || "Role"} Permissions`}
          />

          {adminLocked && (
            <p className="text-xs text-on-surface-variant dark:text-zinc-500">
              Admin always holds every permission, so an install cannot lock
              itself out of this screen.
            </p>
          )}
          <PermissionPicker
            value={formPermissions}
            onChange={setFormPermissions}
            locked={adminLocked}
          />

          {formError && (
            <p className="text-sm text-error" role="alert">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleSave} loading={saving}>
              {editTarget ? "Save changes" : "Create role"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete role?"
        message={
          pendingDelete
            ? `${pendingDelete.name} will be removed. Users still holding it must be moved first.`
            : ""
        }
        confirmLabel="Delete role"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
