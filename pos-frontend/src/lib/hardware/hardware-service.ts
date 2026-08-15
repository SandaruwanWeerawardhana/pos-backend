import { HARDWARE_CONFIG, HAL_URL_ENV_VAR } from "@/lib/types/hardware.config";
import type { DeviceStatus, ScaleReading } from "@/lib/types";

// Real WebSocket client for a HAL server (no such server exists yet - see
// plan notes: Next.js API routes can't hold a persistent WS server, so this
// connects directly to whatever NEXT_PUBLIC_HAL_URL points at). Falls back
// to a simulated reading generator when no HAL answers, so the UI is
// clickable/testable without physical hardware. Swap to real hardware later
// just by setting the env var.

type ScaleListener = (reading: ScaleReading) => void;
type BarcodeListener = (code: string) => void;
type StatusListener = (status: DeviceStatus, simulated: boolean) => void;

function getRandomUnitInterval(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] / 0x100000000;
}

class HardwareService {
  private readonly scaleListeners = new Set<ScaleListener>();
  private readonly barcodeListeners = new Set<BarcodeListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private simulatedTimer: ReturnType<typeof setInterval> | null = null;
  private status: DeviceStatus = "disconnected";
  private simulated = false;
  private lastGrams = 0;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    const url = process.env[HAL_URL_ENV_VAR];
    if (!url || typeof WebSocket === "undefined") {
      this.startSimulated();
      return;
    }

    this.setStatus("connecting", false);

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.startSimulated();
      return;
    }

    const connectTimeout = setTimeout(() => {
      if (this.status !== "connected") {
        socket.close();
        this.startSimulated();
      }
    }, HARDWARE_CONFIG.connectTimeoutMs);

    socket.addEventListener("open", () => {
      clearTimeout(connectTimeout);
      this.setStatus("connected", false);
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener("close", () => {
      clearTimeout(connectTimeout);
      if (!this.simulated) {
        this.setStatus("error", false);
        this.startSimulated();
      }
    });
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;

    const frame = data as { type?: string; grams?: number; stable?: boolean; code?: string };
    if (frame.type === "scale" && typeof frame.grams === "number") {
      const reading: ScaleReading = { grams: frame.grams, stable: Boolean(frame.stable) };
      this.scaleListeners.forEach((cb) => cb(reading));
    } else if (frame.type === "barcode" && typeof frame.code === "string") {
      this.barcodeListeners.forEach((cb) => cb(frame.code!));
    }
  }

  private startSimulated(): void {
    if (this.simulatedTimer) return;
    this.setStatus("connected", true);
    this.lastGrams = 100 + Math.round(getRandomUnitInterval() * 400);

    this.simulatedTimer = setInterval(() => {
      const jitter =
        (getRandomUnitInterval() - 0.5) *
        2 *
        HARDWARE_CONFIG.simulatedScaleJitterGrams;
      this.lastGrams = Math.max(0, this.lastGrams + jitter);
      const reading: ScaleReading = {
        grams: Math.round(this.lastGrams),
        stable: Math.abs(jitter) < HARDWARE_CONFIG.simulatedScaleJitterGrams / 2,
      };
      this.scaleListeners.forEach((cb) => cb(reading));
    }, HARDWARE_CONFIG.simulatedScalePollMs);
  }

  subscribeScale(cb: ScaleListener): () => void {
    this.start();
    this.scaleListeners.add(cb);
    return () => this.scaleListeners.delete(cb);
  }

  subscribeBarcode(cb: BarcodeListener): () => void {
    this.start();
    this.barcodeListeners.add(cb);
    return () => this.barcodeListeners.delete(cb);
  }

  subscribeStatus(cb: StatusListener): () => void {
    this.start();
    this.statusListeners.add(cb);
    cb(this.status, this.simulated);
    return () => this.statusListeners.delete(cb);
  }

  // Zeroes the simulated/real scale's current reading baseline.
  tare(): void {
    this.lastGrams = 0;
  }

  getStatus(): { status: DeviceStatus; simulated: boolean } {
    return { status: this.status, simulated: this.simulated };
  }

  private setStatus(status: DeviceStatus, simulated: boolean): void {
    this.status = status;
    this.simulated = simulated;
    this.statusListeners.forEach((cb) => cb(status, simulated));
  }
}

export const hardwareService = new HardwareService();
