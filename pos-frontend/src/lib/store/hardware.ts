import { create } from "zustand";
import type { DeviceKind, DeviceStatus, ScaleReading } from "@/lib/types";

interface HardwareDeviceEntry {
  status: DeviceStatus;
  simulated: boolean;
  lastReading?: ScaleReading;
}

interface HardwareState {
  devices: Record<DeviceKind, HardwareDeviceEntry>;
  setStatus: (kind: DeviceKind, status: DeviceStatus, simulated: boolean) => void;
  setScaleReading: (reading: ScaleReading) => void;
}

const initialDeviceEntry: HardwareDeviceEntry = {
  status: "disconnected",
  simulated: false,
};

// Ephemeral (not persisted) - device connection state should reset on reload,
// not resume from a stale localStorage snapshot.
export const useHardwareStore = create<HardwareState>((set) => ({
  devices: {
    scale: { ...initialDeviceEntry },
    barcode: { ...initialDeviceEntry },
  },
  setStatus: (kind, status, simulated) =>
    set((state) => ({
      devices: {
        ...state.devices,
        [kind]: { ...state.devices[kind], status, simulated },
      },
    })),
  setScaleReading: (reading) =>
    set((state) => ({
      devices: {
        ...state.devices,
        scale: { ...state.devices.scale, lastReading: reading },
      },
    })),
}));
