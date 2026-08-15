"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PackageCheck, Undo2 } from "lucide-react";
import {
  createPurchaseReturn,
  getPurchaseOrder,
  receiveGoods,
  updatePurchaseOrderStatus,
  type ReceiptLineInput,
} from "@/lib/db";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const STATUS_VARIANT: Record<
  PurchaseOrderStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  ordered: "warning",
  partial: "warning",
  received: "success",
  cancelled: "danger",
};

interface ReceiptDraft {
  quantity: string;
  batchNo: string;
  expiry: string;
}

export default function PurchaseOrderDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const { showToast } = useToast();
  const { money } = useSettings();

  const [order, setOrder] = useState<PurchaseOrder | null | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, ReceiptDraft>>({});
  const [saving, setSaving] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>(
    {},
  );

  function seedDrafts(source: PurchaseOrder) {
    const next: Record<string, ReceiptDraft> = {};
    for (const line of source.lines) {
      // Default to whatever is still outstanding — the common case is a
      // delivery that completes the line.
      const outstanding = line.quantity_ordered - line.quantity_received;
      next[line.product_id] = {
        quantity: outstanding > 0 ? String(outstanding) : "",
        batchNo: line.batch_no ?? "",
        expiry: line.expiry_date ?? "",
      };
    }
    setDrafts(next);
  }

  useEffect(() => {
    getPurchaseOrder(id).then((found) => {
      setOrder(found ?? null);
      if (found) seedDrafts(found);
    });
  }, [id]);

  async function handleReceive() {
    if (!order) return;
    const received: ReceiptLineInput[] = order.lines.flatMap((line) => {
      const draft = drafts[line.product_id];
      const quantity = Number(draft?.quantity ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return [];
      return [
        {
          productId: line.product_id,
          quantity,
          batchNo: draft.batchNo.trim() || undefined,
          expiryDate: draft.expiry || null,
        },
      ];
    });

    if (received.length === 0) {
      showToast("Enter at least one received quantity", "error");
      return;
    }

    setSaving(true);
    try {
      const updated = await receiveGoods(order.id, received);
      if (updated) {
        setOrder({ ...updated });
        seedDrafts(updated);
      }
      showToast("Goods received and stock updated", "success");
    } catch {
      showToast("Failed to record goods receipt", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!order) return;
    await updatePurchaseOrderStatus(order.id, "cancelled");
    setOrder({ ...order, status: "cancelled" });
    showToast("Purchase order cancelled", "success");
  }

  async function handleReturn() {
    if (!order) return;
    const lines = order.lines.flatMap((line) => {
      const quantity = Number(returnQuantities[line.product_id] ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return [];
      return [
        {
          product_id: line.product_id,
          product_name: line.product_name,
          quantity,
          unit_cost_cents: line.unit_cost_cents,
        },
      ];
    });

    if (lines.length === 0 || !returnReason.trim()) {
      showToast("Enter a reason and at least one quantity", "error");
      return;
    }

    await createPurchaseReturn({
      purchaseOrderId: order.id,
      supplierName: order.supplier_name,
      reason: returnReason.trim(),
      lines,
    });
    setReturnOpen(false);
    setReturnReason("");
    setReturnQuantities({});
    showToast("Purchase return recorded", "success");
  }

  if (order === undefined) {
    return (
      <output aria-label="Loading purchase order" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </output>
    );
  }

  if (order === null) {
    return (
      <EmptyState
        title="Purchase order not found"
        description="It may have been deleted, or the link is out of date."
        action={
          <Link
            href={ROUTES.purchases.root}
            className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-5 text-sm font-medium text-on-secondary dark:bg-white dark:text-zinc-900"
          >
            Back to purchases
          </Link>
        }
      />
    );
  }

  const canReceive = order.status !== "received" && order.status !== "cancelled";

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Supply"
        title={order.reference}
        description={`${order.supplier_name} · raised ${formatDate(order.created_at)}`}
        breadcrumbs={[
          { label: "Purchases", href: ROUTES.purchases.root },
          { label: order.reference },
        ]}
        actions={
          <>
            <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReturnOpen(true)}
            >
              <Undo2 size={15} />
              Return to supplier
            </Button>
            {canReceive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
              >
                Cancel order
              </Button>
            )}
          </>
        }
      />

      <Card>
        <SectionHeader title="Lines" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">Product</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Ordered</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Received</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Unit cost</th>
                {canReceive && (
                  <>
                    <th scope="col" className="py-2 pr-4 font-semibold">Receive now</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Batch</th>
                    <th scope="col" className="py-2 font-semibold">Expiry</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50 dark:divide-zinc-800">
              {order.lines.map((line) => (
                <tr key={line.product_id} className="text-on-surface dark:text-zinc-50">
                  <td className="py-3 pr-4 font-medium">{line.product_name}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {line.quantity_ordered}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {line.quantity_received}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {money(line.unit_cost_cents)}
                  </td>
                  {canReceive && (
                    <>
                      <td className="py-2 pr-4">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          aria-label={`Quantity received for ${line.product_name}`}
                          value={drafts[line.product_id]?.quantity ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [line.product_id]: {
                                ...current[line.product_id],
                                quantity: event.target.value,
                              },
                            }))
                          }
                          className="w-24"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <Input
                          aria-label={`Batch number for ${line.product_name}`}
                          value={drafts[line.product_id]?.batchNo ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [line.product_id]: {
                                ...current[line.product_id],
                                batchNo: event.target.value,
                              },
                            }))
                          }
                          className="w-28"
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          type="date"
                          aria-label={`Expiry date for ${line.product_name}`}
                          value={drafts[line.product_id]?.expiry ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [line.product_id]: {
                                ...current[line.product_id],
                                expiry: event.target.value,
                              },
                            }))
                          }
                          className="w-36"
                        />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-4 dark:border-zinc-800">
          <span className="text-sm text-on-surface-variant dark:text-zinc-400">
            Order total
          </span>
          <span className="text-xl font-bold tabular-nums text-on-surface dark:text-zinc-50">
            {money(order.total_cents)}
          </span>
        </div>

        {canReceive && (
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={handleReceive} disabled={saving}>
              <PackageCheck size={16} />
              {saving ? "Booking in…" : "Book goods in"}
            </Button>
          </div>
        )}
      </Card>

      {order.notes && (
        <Card>
          <SectionHeader title="Notes" />
          <p className="mt-3 text-sm text-on-surface-variant dark:text-zinc-400">
            {order.notes}
          </p>
        </Card>
      )}

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Return to supplier"
        description="Stock is removed and the return is logged against this order."
        size="md"
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Reason"
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            placeholder="Damaged on arrival, wrong item, …"
            autoFocus
          />
          {order.lines.map((line) => (
            <Input
              key={line.product_id}
              label={line.product_name}
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={returnQuantities[line.product_id] ?? ""}
              onChange={(event) =>
                setReturnQuantities((current) => ({
                  ...current,
                  [line.product_id]: event.target.value,
                }))
              }
            />
          ))}
          <Button type="button" onClick={handleReturn} disabled={!returnReason.trim()}>
            Record return
          </Button>
        </div>
      </Modal>
    </div>
  );
}
