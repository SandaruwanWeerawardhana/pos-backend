"use client";

import { HelpCircle } from "lucide-react";
import { PERMISSIONS, type Permission } from "@/lib/types";

/**
 * Permission strings are `resource.action`. The picker renders one card per
 * resource with a checkbox per action, so the grid grows on its own when a
 * permission is added to `PERMISSIONS` — there is no second list to update.
 */
const MODULE_LABELS: Record<string, string> = {
  pos: "Point of sale",
  products: "Products",
  inventory: "Inventory",
  purchases: "Purchasing",
  reports: "Reports",
  settings: "Settings",
  users: "Users management",
};

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  manage: "Manage",
  sell: "Sell",
  refund: "Refund",
  discount: "Discount",
  adjust: "Adjust",
};

// What each permission actually unlocks, shown on the "?" next to the label.
const ACTION_HINTS: Record<string, string> = {
  "pos.sell": "Take payments at the till",
  "pos.refund": "Refund a completed sale",
  "pos.discount": "Apply a discount to a cart",
  "products.view": "See the product catalogue",
  "products.manage": "Create, edit and delete products",
  "inventory.view": "See stock levels and batches",
  "inventory.adjust": "Adjust stock and record movements",
  "purchases.view": "See purchase orders and returns",
  "purchases.manage": "Raise and receive purchase orders",
  "reports.view": "Open the reports screens",
  "settings.manage": "Change business and hardware settings",
  "users.manage": "Add users and edit group permissions",
};

function moduleOf(permission: string): string {
  return permission.split(".")[0];
}

function actionOf(permission: string): string {
  const action = permission.split(".")[1];
  return ACTION_LABELS[action] ?? action;
}

const MODULES = Array.from(new Set(PERMISSIONS.map(moduleOf)));

interface PermissionPickerProps {
  value: Permission[];
  onChange: (permissions: Permission[]) => void;
  /** Renders every box ticked and non-interactive (used for Admin). */
  locked?: boolean;
  error?: string;
}

export function PermissionPicker({
  value,
  onChange,
  locked = false,
  error,
}: Readonly<PermissionPickerProps>) {
  function toggle(permission: Permission) {
    onChange(
      value.includes(permission)
        ? value.filter((entry) => entry !== permission)
        : [...value, permission],
    );
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={locked}>
      <legend className="sr-only">Permissions</legend>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((module) => {
          const permissions = PERMISSIONS.filter(
            (permission) => moduleOf(permission) === module,
          );
          const allChecked = permissions.every((permission) =>
            value.includes(permission),
          );
          return (
            <section
              key={module}
              className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2 rounded-t-xl bg-surface-container-low px-4 py-3 dark:bg-zinc-800/60">
                <h3 className="text-sm font-semibold text-on-surface dark:text-zinc-100">
                  {MODULE_LABELS[module] ?? module}
                </h3>
                {!locked && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        allChecked
                          ? value.filter(
                              (permission) => moduleOf(permission) !== module,
                            )
                          : Array.from(new Set([...value, ...permissions])),
                      )
                    }
                    className="rounded text-xs font-medium text-primary transition-colors duration-[var(--duration-fast)] hover:underline dark:text-blue-400"
                  >
                    {allChecked ? "None" : "All"}
                  </button>
                )}
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2">
                {permissions.map((permission) => (
                  <label
                    key={permission}
                    className="flex items-start gap-2 text-sm text-on-surface dark:text-zinc-100"
                  >
                    <input
                      type="checkbox"
                      checked={locked || value.includes(permission)}
                      onChange={() => toggle(permission)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <span className="flex items-center gap-1.5">
                      {actionOf(permission)}
                      <span
                        title={`${ACTION_HINTS[permission] ?? permission} (${permission})`}
                        className="inline-flex cursor-help text-primary dark:text-blue-400"
                      >
                        <HelpCircle
                          size={13}
                          aria-label={ACTION_HINTS[permission] ?? permission}
                        />
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {error && (
        <p className="animate-fade-in text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
