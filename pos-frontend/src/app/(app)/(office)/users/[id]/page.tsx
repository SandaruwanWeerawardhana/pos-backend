"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  displayUsername,
  getStaffUser,
  nameParts,
  setStaffPin,
  updateStaffUser,
} from "@/lib/db";
import type { StaffUser } from "@/lib/types";
import {
  EMPTY_USER_FORM,
  UserForm,
  type UserFormValues,
} from "@/components/ui/UserForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

export default function EditUserPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const found = await getStaffUser(id);
      if (!found) {
        setNotFound(true);
        return;
      }
      setUser(found);
    })();
  }, [id]);

  const initialValues = useMemo<UserFormValues>(() => {
    if (!user) return EMPTY_USER_FORM;
    const { first, last } = nameParts(user);
    return {
      first_name: first,
      last_name: last,
      username: displayUsername(user),
      phone: user.phone ?? "",
      email: user.email,
      role_id: user.role_id,
      avatar: user.avatar ?? "",
      view_all_records: user.view_all_records ?? false,
      warehouse_ids: user.warehouse_ids ?? [],
      all_warehouses: user.warehouse_ids === undefined,
      // Always blank: the stored PIN is a hash, so there is nothing to prefill
      // and an empty field means "leave the current password alone".
      password: "",
    };
  }, [user]);

  async function handleSubmit(values: UserFormValues) {
    if (!user) return;
    await updateStaffUser(user.id, {
      name: `${values.first_name.trim()} ${values.last_name.trim()}`.trim(),
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      username: values.username.trim(),
      phone: values.phone.trim(),
      email: values.email.trim().toLowerCase(),
      role_id: values.role_id,
      avatar: values.avatar || undefined,
      view_all_records: values.view_all_records,
      warehouse_ids: values.all_warehouses ? undefined : values.warehouse_ids,
    });
    // Hashing is separate from the rest of the row, and only runs when the
    // manager actually typed a new PIN.
    if (values.password) await setStaffPin(user.id, values.password);
    showToast("User updated", "success");
    router.push(ROUTES.users.root);
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader
          title="Edit"
          breadcrumbs={[
            { label: "Users", href: ROUTES.users.root },
            { label: "Edit" },
          ]}
        />
        <p className="rounded-xl border border-dashed border-outline-variant py-10 text-center text-sm text-on-surface-variant dark:border-zinc-800 dark:text-zinc-400">
          That user no longer exists.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Edit"
        breadcrumbs={[
          { label: "Users", href: ROUTES.users.root },
          { label: "Edit" },
        ]}
      />
      {user ? (
        <UserForm
          // Remounts if the route switches to another user, so the fields are
          // seeded from that user rather than kept from the previous one.
          key={user.id}
          mode="edit"
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={() => router.push(ROUTES.users.root)}
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant p-4 sm:p-6 dark:border-zinc-800">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
