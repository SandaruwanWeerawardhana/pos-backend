"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { usePlugin } from "@/lib/hooks/use-plugin";
import { useSettings } from "@/lib/hooks/use-settings";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import type { StoreSettings } from "@/lib/types";
import { ROUTES } from "@/lib/types/routes";

export default function SettingsPage() {
  const { settings, save } = useSettings();
  const { all, active, setActivePlugin } = usePlugin();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [draft, setDraft] = useState<StoreSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);

  function update<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }


  function wholeNonNegative(raw: string): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await save(draft);
      setDirty(false);
      showToast("Settings saved", "success");
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Settings" },
        ]}
        actions={
          <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
            <Save size={16} />
            {saving ? "Saving…" : "Save settings"}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Store details" />
          <div className="mt-4 flex flex-col gap-3">
            <Input
              label="Store name"
              value={draft.store_name}
              onChange={(event) => update("store_name", event.target.value)}
            />
            <Input
              label="Legal name"
              value={draft.legal_name ?? ""}
              onChange={(event) => update("legal_name", event.target.value)}
            />
            <Input
              label="Address"
              value={draft.address ?? ""}
              onChange={(event) => update("address", event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Phone"
                value={draft.phone ?? ""}
                onChange={(event) => update("phone", event.target.value)}
              />
              <Input
                label="Tax registration ID"
                value={draft.tax_id ?? ""}
                onChange={(event) => update("tax_id", event.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Receipt" />
          <div className="mt-4 flex flex-col gap-3">
            <Input
              label="Header line"
              value={draft.receipt_header ?? ""}
              onChange={(event) => update("receipt_header", event.target.value)}
              placeholder="Shown under the store name"
            />
            <Input
              label="Footer line"
              value={draft.receipt_footer ?? ""}
              onChange={(event) => update("receipt_footer", event.target.value)}
            />
            <Select
              label="Paper width"
              value={draft.receipt_paper_width}
              onChange={(event) =>
                update(
                  "receipt_paper_width",
                  event.target.value as StoreSettings["receipt_paper_width"],
                )
              }
              options={[
                { value: "58mm", label: "58 mm" },
                { value: "80mm", label: "80 mm" },
              ]}
            />
            <label className="flex items-center gap-2 text-sm text-on-surface dark:text-zinc-100">
              <input
                type="checkbox"
                checked={draft.receipt_show_tax_breakdown}
                onChange={(event) =>
                  update("receipt_show_tax_breakdown", event.target.checked)
                }
                className="h-4 w-4 rounded border-outline-variant"
              />
              Show tax breakdown on receipts
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface dark:text-zinc-100">
              <input
                type="checkbox"
                checked={draft.receipt_show_logo}
                onChange={(event) => update("receipt_show_logo", event.target.checked)}
                className="h-4 w-4 rounded border-outline-variant"
              />
              Show store name prominently
            </label>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Stock thresholds" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              label="Low stock threshold"
              type="number"
              min="0"
              step="1"
              value={String(draft.low_stock_threshold)}
              onChange={(event) =>
                update("low_stock_threshold", wholeNonNegative(event.target.value))
              }
            />
            <Input
              label="Expiry warning (days)"
              type="number"
              min="0"
              step="1"
              value={String(draft.expiry_warning_days)}
              onChange={(event) =>
                update("expiry_warning_days", wholeNonNegative(event.target.value))
              }
            />
          </div>
        </Card>

        <Card>
          <SectionHeader title="Appearance" />
          <div className="mt-4 flex flex-col gap-3">
            <Select
              label="Theme"
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as "light" | "dark" | "system")
              }
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "Match system" },
              ]}
            />
          </div>
        </Card>

        <Card>
          <SectionHeader title="Plugin" />
          <div className="mt-4 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-on-surface-variant dark:text-zinc-300">
              <input
                type="radio"
                name="plugin"
                checked={active === null}
                onChange={() => setActivePlugin(null)}
              />
              None
            </label>
            {all.map((plugin) => (
              <label
                key={plugin.key}
                className="flex items-center gap-2 text-sm text-on-surface-variant dark:text-zinc-300"
              >
                <input
                  type="radio"
                  name="plugin"
                  checked={active?.key === plugin.key}
                  onChange={() => setActivePlugin(plugin.key)}
                />
                {plugin.label}
              </label>
            ))}
          </div>
          <Link
            href={ROUTES.settings.hardware}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline dark:text-blue-400"
          >
            Hardware setup →
          </Link>
        </Card>
      </div>
    </div>
  );
}
