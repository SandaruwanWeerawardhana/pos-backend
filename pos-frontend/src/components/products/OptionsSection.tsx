"use client";

import {
  PluginProductForm,
  type PluginFieldValues,
} from "@/components/plugin-slots/PluginProductForm";
import { Switch } from "@/components/ui/Switch";
import { Database } from "lucide-react";
import { Controller } from "react-hook-form";
import { FormSection } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface OptionsSectionProps extends ProductSectionProps {
  pluginValues: PluginFieldValues;
  onPluginChange: (key: string, value: string | number | boolean) => void;
}

type ToggleName =
  | "has_serial"
  | "not_for_selling"
  | "is_active"
  | "is_featured"
  | "hide_from_online"
  | "enable_preorder";

const TOGGLES: { name: ToggleName; label: string; description: string }[] = [
  {
    name: "has_serial",
    label: "Product Has Imei/Serial Number",
    description: "Each unit's serial is captured at the till.",
  },
  {
    name: "not_for_selling",
    label: "This Product Not For Selling",
    description: "Stocked but never offered at the till — packaging, supplies.",
  },
  {
    name: "is_active",
    label: "Active",
    description: "Inactive products stay in reports but leave the till search.",
  },
  {
    name: "is_featured",
    label: "Featured Product",
    description: "Pinned to the top of the till's product grid.",
  },
  {
    name: "hide_from_online",
    label: "Hide From Online Store",
    description: "Sold in store only.",
  },
  {
    name: "enable_preorder",
    label: "Enable Pre-Order",
    description: "Sellable at zero stock, fulfilled once it arrives.",
  },
];

/**
 * Till and storefront policy switches, plus whatever the active business-type
 * plugin adds. The plugin slot is rendered here rather than at the bottom of
 * the page so its fields sit inside the same card rhythm as everything else.
 */
export function OptionsSection({
  form,
  pluginValues,
  onPluginChange,
}: Readonly<OptionsSectionProps>) {
  const { control } = form;

  return (
    <FormSection
      id="options"
      title="Options"
      description="How the till and the storefront are allowed to treat this product"
      icon={<Database size={18} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOGGLES.map((toggle) => (
          <Controller
            key={toggle.name}
            control={control}
            name={toggle.name}
            render={({ field }) => (
              <Switch
                label={toggle.label}
                description={toggle.description}
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        ))}
      </div>

      <div className="mt-4 empty:mt-0">
        <PluginProductForm values={pluginValues} onChange={onPluginChange} />
      </div>
    </FormSection>
  );
}
