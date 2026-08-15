"use client";

import { usePluginStore } from "@/lib/store/plugin";
import { pluginRegistry } from "@/plugins/registry";
import type { PluginDefinition } from "@/lib/types";

export interface UsePluginResult {
  active: PluginDefinition | null;
  all: PluginDefinition[];
  setActivePlugin: (key: string | null) => void;
}

export function usePlugin(): UsePluginResult {
  const activePluginKey = usePluginStore((state) => state.activePluginKey);
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  const active =
    pluginRegistry.find((plugin) => plugin.key === activePluginKey) ?? null;

  return { active, all: pluginRegistry, setActivePlugin };
}
