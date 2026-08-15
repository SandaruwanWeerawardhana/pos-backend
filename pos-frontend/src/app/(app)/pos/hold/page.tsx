"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteHeldCart, listHeldCarts, resumeHeldCart } from "@/lib/db";
import type { HeldCart } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

export default function PosHoldPage() {
  const [held, setHeld] = useState<HeldCart[]>([]);
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    listHeldCarts().then(setHeld);
  }, []);

  async function refresh() {
    setHeld(await listHeldCarts());
  }

  async function handleResume(id: string) {
    await resumeHeldCart(id);
    showToast("Cart resumed", "success");
    router.push(ROUTES.pos.root);
  }

  const columns: TableColumn<HeldCart>[] = [
    { key: "label", header: "Label", render: (cart) => cart.label },
    {
      key: "items",
      header: "Items",
      render: (cart) => `${cart.items.length}`,
    },
    {
      key: "created",
      header: "Held at",
      render: (cart) => new Date(cart.created_at).toLocaleTimeString(),
    },
    {
      key: "actions",
      header: "",
      render: (cart) => (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleResume(cart.id)}>
            Resume
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteHeldCart(cart.id).then(refresh)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Held transactions
        </h1>
        <Link
          href={ROUTES.pos.root}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Back to terminal
        </Link>
      </div>
      <Table
        columns={columns}
        rows={held}
        rowKey={(cart) => cart.id}
        emptyMessage="No held carts."
      />
    </div>
  );
}
