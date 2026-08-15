"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  deleteHeldCart,
  holdCart,
  listHeldCarts,
  resumeHeldCart,
} from "@/lib/db";
import type { HeldCart } from "@/lib/types";

interface HoldModalProps {
  open: boolean;
  onClose: () => void;
  hasItemsInCart: boolean;
  onResumed: () => void;
}

export function HoldModal({
  open,
  onClose,
  hasItemsInCart,
  onResumed,
}: HoldModalProps) {
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (open) listHeldCarts().then(setHeld);
  }, [open]);

  async function refresh() {
    setHeld(await listHeldCarts());
  }

  async function handleHold() {
    await holdCart(label || `Hold ${new Date().toLocaleTimeString()}`);
    setLabel("");
    onClose();
  }

  async function handleResume(id: string) {
    await resumeHeldCart(id);
    onResumed();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Held carts">
      {hasItemsInCart && (
        <div className="mb-4 flex gap-2">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label (optional)"
            className="flex-1"
          />
          <Button type="button" onClick={handleHold}>
            Hold current cart
          </Button>
        </div>
      )}
      {held.length === 0 ? (
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          No held carts.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {held.map((cart) => (
            <li
              key={cart.id}
              className="flex items-center justify-between rounded-lg border border-outline-variant px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="text-on-surface dark:text-zinc-50">
                {cart.label}{" "}
                <span className="text-on-surface-variant">
                  ({cart.items.length} items)
                </span>
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleResume(cart.id)}
                >
                  Resume
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteHeldCart(cart.id).then(refresh)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
