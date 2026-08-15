import type { PluginField } from "@/lib/types";

export const weightedItemFields: PluginField[] = [
  {
    key: "weight_unit",
    label: "Weight unit",
    type: "select",
    options: ["g", "kg", "lb"],
    required: true,
  },
];
