"use client";

import { useEffect } from "react";
import { hardwareService } from "@/lib/hardware/hardware-service";
import { useHardwareStore } from "@/lib/store/hardware";
import type { DeviceKind } from "@/lib/types";

// hardwareService holds one shared HAL connection (real or simulated) that
// carries both scale and barcode frames, so device status is the same
// underlying connection regardless of which kind is asked about.
export function useHardware(kind: DeviceKind) {
  const entry = useHardwareStore((state) => state.devices[kind]);
  const setStatus = useHardwareStore((state) => state.setStatus);

  useEffect(() => {
    const unsubscribe = hardwareService.subscribeStatus((status, simulated) => {
      setStatus(kind, status, simulated);
    });
    return unsubscribe;
  }, [kind, setStatus]);

  return entry;
}
