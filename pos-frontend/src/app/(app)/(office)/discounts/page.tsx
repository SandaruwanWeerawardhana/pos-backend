"use client";

import { useEffect, useState } from "react";
import { Tag, Trash2 } from "lucide-react";
import {
  createDiscount,
  deleteDiscount,
  listDiscounts,
  updateDiscount,
} from "@/lib/db";
import type { Discount, DiscountType } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { formatDate, parseMoneyToCents } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const TYPES: { value: DiscountType; label: string }[] = [
  { value: "percentage", label: "Percentage off" },
  { value: "fixed_cents", label: "Fixed amount off" },
  { value: "bogo", label: "Buy one get one (BOGO)" },
  { value: "bundle", label: "Bundle price" },
  { value: "seasonal", label: "Seasonal percentage" },
];

function describeValue(
  discount: Discount,
  money: (cents: number) => string,
): string {
  switch (discount.type) {
    case "percentage":
    case "seasonal":
      return `${discount.value}%`;
    case "bogo":
      return `Buy ${discount.buy_quantity ?? 1}, get ${discount.get_quantity ?? 1}`;
    default:
      return money(discount.value);
  }
}

// A campaign is "live" only inside its window; the badge distinguishes that
// from merely being toggled active, which is what the till actually honours.
function campaignState(discount: Discount, now: number): string {
  if (!discount.active) return "Inactive";
  if (discount.starts_at && now < discount.starts_at) return "Scheduled";
  if (discount.ends_at && now > discount.ends_at) return "Expired";
  return "Live";
}

export default function DiscountsPage() {
  const { showToast } = useToast();
  const { money } = useSettings();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Discount | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<DiscountType>("percentage");
  const [value, setValue] = useState("");
  const [buyQuantity, setBuyQuantity] = useState("1");
  const [getQuantity, setGetQuantity] = useState("1");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function refresh() {
    setDiscounts(await listDiscounts());
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetForm() {
    setName("");
    setType("percentage");
    setValue("");
    setBuyQuantity("1");
    setGetQuantity("1");
    setMinSubtotal("");
    setStartsAt("");
    setEndsAt("");
  }

  async function handleCreate() {
    if (!name.trim()) return;

    // BOGO carries its offer in buy/get quantities, so the numeric `value`
    // field is not required for that type.
    const numeric = Number(value);
    if (type !== "bogo" && !Number.isFinite(numeric)) {
      showToast("Enter a valid value", "error");
      return;
    }

    const storedValue =
      type === "fixed_cents" || type === "bundle"
        ? (parseMoneyToCents(value) ?? 0)
        : type === "bogo"
          ? 0
          : numeric;

    await createDiscount({
      name: name.trim(),
      type,
      value: storedValue,
      active: true,
      ...(type === "bogo"
        ? {
            buy_quantity: Number(buyQuantity) || 1,
            get_quantity: Number(getQuantity) || 1,
          }
        : {}),
      ...(minSubtotal
        ? { min_subtotal_cents: parseMoneyToCents(minSubtotal) ?? 0 }
        : {}),
      ...(startsAt ? { starts_at: new Date(startsAt).getTime() } : {}),
      ...(endsAt ? { ends_at: new Date(endsAt).getTime() } : {}),
    });

    resetForm();
    setModalOpen(false);
    await refresh();
    showToast("Promotion created", "success");
  }

  async function toggleActive(discount: Discount) {
    await updateDiscount(discount.id, { active: !discount.active });
    await refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await deleteDiscount(pendingDelete.id);
    setPendingDelete(null);
    await refresh();
    showToast("Promotion deleted", "success");
  }

  const now = Date.now();

  const columns: DataColumn<Discount>[] = [
    {
      key: "name",
      header: "Promotion",
      sortValue: (discount) => discount.name,
      render: (discount) => (
        <span className="font-medium">
          {discount.name}
          <span className="block text-xs font-normal capitalize text-on-surface-variant dark:text-zinc-400">
            {discount.type.replace("_", " ")}
          </span>
        </span>
      ),
    },
    {
      key: "value",
      header: "Offer",
      sortValue: (discount) => discount.value,
      render: (discount) => describeValue(discount, money),
    },
    {
      key: "window",
      header: "Runs",
      hideOnMobile: true,
      render: (discount) =>
        discount.starts_at || discount.ends_at
          ? `${discount.starts_at ? formatDate(discount.starts_at) : "—"} → ${
              discount.ends_at ? formatDate(discount.ends_at) : "—"
            }`
          : "Always",
    },
    {
      key: "threshold",
      header: "Min spend",
      align: "right",
      hideOnMobile: true,
      render: (discount) =>
        discount.min_subtotal_cents ? money(discount.min_subtotal_cents) : "—",
    },
    {
      key: "state",
      header: "Status",
      render: (discount) => {
        const state = campaignState(discount, now);
        let variant: "neutral" | "success" | "warning" = "neutral";
        if (state === "Live") variant = "success";
        else if (state === "Scheduled" || state === "Expired") variant = "warning";
        return (
          <button type="button" onClick={() => toggleActive(discount)}>
            <Badge variant={variant}>{state}</Badge>
          </button>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (discount) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPendingDelete(discount)}
        >
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  const isAmountType = type === "fixed_cents" || type === "bundle";

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Discounts & promotions"
        description="Percentage and fixed discounts, BOGO offers, bundles, and seasonal campaigns with date windows."
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Promotions" },
        ]}
        actions={
          <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
            <Tag size={15} />
            New promotion
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={discounts}
        rowKey={(discount) => discount.id}
        emptyMessage="No promotions yet. Create one to offer it at the till."
        caption="Discounts and promotions"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New promotion"
        size="md"
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <Select
            label="Type"
            value={type}
            onChange={(event) => setType(event.target.value as DiscountType)}
            options={TYPES}
          />

          {type === "bogo" ? (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Buy quantity"
                type="number"
                min="1"
                step="1"
                value={buyQuantity}
                onChange={(event) => setBuyQuantity(event.target.value)}
              />
              <Input
                label="Get free"
                type="number"
                min="1"
                step="1"
                value={getQuantity}
                onChange={(event) => setGetQuantity(event.target.value)}
              />
            </div>
          ) : (
            <Input
              label={isAmountType ? "Amount off" : "Percentage (0-100)"}
              type="number"
              step={isAmountType ? "0.01" : "1"}
              min="0"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}

          <Input
            label="Minimum spend (optional)"
            type="number"
            step="0.01"
            min="0"
            value={minSubtotal}
            onChange={(event) => setMinSubtotal(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Starts"
              type="date"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
            <Input
              label="Ends"
              type="date"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>

          <Button type="button" onClick={handleCreate} disabled={!name.trim()}>
            Create promotion
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete promotion?"
        message={`"${pendingDelete?.name ?? "This promotion"}" will no longer be offered at the till. Sales that already used it are unaffected.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
