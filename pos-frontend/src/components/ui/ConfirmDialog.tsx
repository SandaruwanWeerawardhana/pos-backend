"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Destructive actions (delete a product, void a sale) go through here rather
// than window.confirm so they are themed, touch-sized, and focus-trapped.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Readonly<ConfirmDialogProps>) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-sm text-on-surface-variant dark:text-zinc-400">
        {message}
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="sm:w-auto"
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "danger" : "primary"}
          onClick={onConfirm}
          loading={busy}
          autoFocus
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
