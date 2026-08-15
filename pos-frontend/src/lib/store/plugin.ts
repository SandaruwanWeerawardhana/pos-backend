import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PluginState {
  activePluginKey: string | null;
  setActivePlugin: (key: string | null) => void;
}

export const usePluginStore = create<PluginState>()(
  persist(
    (set) => ({
      activePluginKey: null,
      setActivePlugin: (key) => set({ activePluginKey: key }),
    }),
    { name: "pos_active_plugin_v1" },
  ),
);
