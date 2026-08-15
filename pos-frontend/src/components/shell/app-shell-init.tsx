"use client";

import { useEffect } from "react";
import { useConnectionListener } from "@/lib/store/connection";
import { syncManager } from "@/lib/sync";
import { ensureDefaultWarehouse } from "@/lib/db/inventory";
import { ensureSystemRoles } from "@/lib/db/users";

export function AppShellInit() {
  useConnectionListener();

  useEffect(() => {
    syncManager.start();
    return () => syncManager.stop();
  }, []);

  // Seeds the rows the rest of the app assumes exist (system roles, a default
  // stock location). Both are no-ops once seeded, so running on every boot is
  // cheap and keeps a wiped IndexedDB self-healing.
  useEffect(() => {
    void ensureSystemRoles();
    void ensureDefaultWarehouse();
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    }
  }, []);

  return null;
}
