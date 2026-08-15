// Device profile constants for the hardware layer (src/lib/hardware, src/lib/hooks/use-*).
// No real HAL server exists yet - these tune the simulated fallback and the
// (currently unused until a real HAL exists) WebSocket connect attempt.

export const HAL_URL_ENV_VAR = "NEXT_PUBLIC_HAL_URL";

export const HARDWARE_CONFIG = {
  // How long to wait for a real HAL WebSocket to open before falling back
  // to the simulated device generator.
  connectTimeoutMs: 2000,
  // Simulated scale: how often a fake reading is emitted, and the jitter
  // range (grams) around the last stable weight.
  simulatedScalePollMs: 500,
  simulatedScaleJitterGrams: 4,
  // Simulated barcode scanner keyboard-wedge: max gap (ms) between keydown
  // events for them to be considered part of the same scanned barcode.
  barcodeWedgeMaxGapMs: 50,
  barcodeWedgeMinLength: 4,
} as const;
