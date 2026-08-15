export type DeviceKind = "scale" | "barcode";

export type DeviceStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ScaleReading {
  grams: number;
  stable: boolean;
}

export interface HardwareDeviceState {
  kind: DeviceKind;
  status: DeviceStatus;
  simulated: boolean;
  lastReading?: ScaleReading;
}
