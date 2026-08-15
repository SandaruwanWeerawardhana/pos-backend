import { create } from "zustand";
import { useEffect } from "react";

interface ConnectionState {
  online: boolean;
  setOnline: (online: boolean) => void;
}

// UI-facing connection status. Initialized from the browser when available.
export const useConnectionStore = create<ConnectionState>((set) => ({
  online:
    typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true,
  setOnline: (online) => set({ online }),
}));

// Wires the store up to the browser's online/offline events. Call once near
// the root of the app (client component only).
export function useConnectionListener() {
  const setOnline = useConnectionStore((state) => state.setOnline);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnline]);
}
