"use client";

import { usePlugin } from "@/lib/hooks/use-plugin";
import { Input } from "@/components/ui/Input";

export type PluginFieldValues = Record<string, string | number | boolean>;

interface PluginProductFormProps {
  values: PluginFieldValues;
  onChange: (key: string, value: string | number | boolean) => void;
}

// Renders the active plugin's field schema (PluginDefinition.fields) as a
// generic form - individual plugins only need to declare fields, not build
// their own form UI.
export function PluginProductForm({ values, onChange }: PluginProductFormProps) {
  const { active } = usePlugin();
  if (!active || active.fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {active.label} fields
      </h3>
      {active.fields.map((field) => {
        if (field.type === "select" && field.options) {
          return (
            <label key={field.key} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {field.label}
              </span>
              <select
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                value={String(values[field.key] ?? "")}
                onChange={(event) => onChange(field.key, event.target.value)}
                required={field.required}
              >
                <option value="" disabled>
                  Select…
                </option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                    {field.unit ? ` ${field.unit}` : ""}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (field.type === "boolean") {
          return (
            <label key={field.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(values[field.key])}
                onChange={(event) => onChange(field.key, event.target.checked)}
              />
              {field.label}
            </label>
          );
        }

        return (
          <Input
            key={field.key}
            label={field.label}
            type={field.type === "number" ? "number" : "text"}
            required={field.required}
            value={String(values[field.key] ?? "")}
            onChange={(event) =>
              onChange(
                field.key,
                field.type === "number"
                  ? Number(event.target.value)
                  : event.target.value,
              )
            }
          />
        );
      })}
    </div>
  );
}
