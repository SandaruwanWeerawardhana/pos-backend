"use client";

import { useRouter } from "next/navigation";
import { createStaffUser } from "@/lib/db";
import {
  EMPTY_USER_FORM,
  UserForm,
  type UserFormValues,
} from "@/components/ui/UserForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

const CREATE_USER_BREADCRUMBS = [
  { label: "Users", href: ROUTES.users.root },
  { label: "Create" },
];

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function CreateUserPage() {
  const router = useRouter();
  const { showToast } = useToast();

  async function handleSubmit(values: UserFormValues) {
    const firstName = values.first_name.trim();
    const lastName = values.last_name.trim();
    const username = values.username.trim();
    const phone = values.phone.trim();
    const email = values.email.trim().toLowerCase();

    await createStaffUser({
      name: `${firstName} ${lastName}`.trim(),
      first_name: firstName,
      last_name: lastName,
      username,
      phone,
      email,
      role_id: values.role_id,
      pin: values.password,
      avatar: optionalText(values.avatar),
      view_all_records: values.view_all_records,
      warehouse_ids: values.all_warehouses ? undefined : values.warehouse_ids,
      active: true,
    });
    showToast("User created", "success");
    router.push(ROUTES.users.root);
  }

  function handleCancel() {
    router.push(ROUTES.users.root);
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Create"
        breadcrumbs={CREATE_USER_BREADCRUMBS}
      />
      <UserForm
        mode="create"
        initialValues={EMPTY_USER_FORM}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}
