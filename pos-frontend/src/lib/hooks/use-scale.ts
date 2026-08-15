"use client";

import { useEffect, useState } from "react";
import { hardwareService } from "@/lib/hardware/hardware-service";
import { useHardwareStore } from "@/lib/store/hardware";
import type { ScaleReading } from "@/lib/types";

export interface UseScaleResult {
  reading: ScaleReading | null;
  tare: () => void;
}

export function useScale(): UseScaleResult {
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const setScaleReading = useHardwareStore((state) => state.setScaleReading);

  useEffect(() => {
    const unsubscribe = hardwareService.subscribeScale((next) => {
      setReading(next);
      setScaleReading(next);
    });
    return unsubscribe;
  }, [setScaleReading]);

  return { reading, tare: () => hardwareService.tare() };
}
