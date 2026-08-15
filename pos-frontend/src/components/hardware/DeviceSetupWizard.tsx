"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useHardware } from "@/lib/hooks/use-hardware";
import type { DeviceKind } from "@/lib/types";

interface SimulatedDevice {
  id: string;
  name: string;
  kind: DeviceKind;
}

const SIMULATED_DEVICES: SimulatedDevice[] = [
  { id: "dev_scale_1", name: "CAS PD-II Scale", kind: "scale" },
  { id: "dev_barcode_1", name: "Honeywell 1900 Scanner", kind: "barcode" },
];

export function DeviceSetupWizard() {
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<SimulatedDevice[]>([]);
  const [pairedIds, setPairedIds] = useState<string[]>([]);
  const scale = useHardware("scale");
  const barcode = useHardware("barcode");

  function scan() {
    setScanning(true);
    setFound([]);
    setTimeout(() => {
      setFound(SIMULATED_DEVICES);
      setScanning(false);
    }, 1200);
  }

  function pair(device: SimulatedDevice) {
    setPairedIds((prev) => [...prev, device.id]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm text-on-surface-variant dark:text-zinc-300">
          <span className="flex items-center gap-1.5">
            Scale:{" "}
            <Badge variant={scale.status === "connected" ? "success" : "neutral"}>
              {scale.status}
              {scale.simulated ? " (simulated)" : ""}
            </Badge>
          </span>
          <span className="flex items-center gap-1.5">
            Barcode:{" "}
            <Badge variant={barcode.status === "connected" ? "success" : "neutral"}>
              {barcode.status}
              {barcode.simulated ? " (simulated)" : ""}
            </Badge>
          </span>
        </div>
        <Button type="button" size="sm" onClick={scan} disabled={scanning}>
          {scanning ? "Scanning…" : "Scan for devices"}
        </Button>
      </div>

      {found.length > 0 && (
        <ul className="flex flex-col gap-2">
          {found.map((device) => (
            <li
              key={device.id}
              className="flex items-center justify-between rounded-lg border border-outline-variant px-4 py-2 text-sm dark:border-zinc-800"
            >
              <span>
                {device.name}{" "}
                <span className="text-on-surface-variant">({device.kind})</span>
              </span>
              {pairedIds.includes(device.id) ? (
                <Badge variant="success">Paired</Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => pair(device)}
                >
                  Pair
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-on-surface-variant">
        No physical HAL server is configured yet — the app already runs
        against a simulated scale/barcode feed. Set NEXT_PUBLIC_HAL_URL to
        connect real hardware.
      </p>
    </div>
  );
}
