"use client";

import { useEffect, useRef, useState } from "react";
import { useBarcode } from "@/lib/hooks/use-barcode";
import { Button } from "@/components/ui/Button";
import type { IScannerControls } from "@zxing/browser";

type BarcodeScannerProps = Readonly<{
  onScan: (code: string) => void;
  // Starts the camera immediately rather than waiting for a click, for
  // callers (e.g. a scanner modal) where opening it IS the "start" action.
  autoStart?: boolean;
  // Fired when the user stops the camera from here, so a host modal can close
  // itself rather than leaving a dialog with nothing running in it.
  onStop?: () => void;
}>;

/**
 * Two real input paths: a USB HID scanner in keyboard-wedge mode (always
 * listening via useBarcode) and live camera decoding via ZXing's WASM-free
 * JS decoder. ZXing runs the decode loop itself against getUserMedia — no
 * dependency on the native BarcodeDetector API, which only a handful of
 * Chromium builds ship, so this works on Firefox/Safari/mobile too.
 */
export function BarcodeScanner({
  onScan,
  autoStart = false,
  onStop,
}: BarcodeScannerProps) {
  const [cameraActive, setCameraActive] = useState(autoStart);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Callers build `onScan` inline, so it is a new function on every render of
  // the host form. Held in a ref rather than a dependency: with it in the dep
  // array the camera tore down and restarted on every keystroke elsewhere in
  // the form, and the preview never got far enough to show a frame.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Starting and stopping are serialised through one chain, and each attempt
  // carries a token. Two getUserMedia calls racing on the same <video> — which
  // is exactly what StrictMode's double mount produces — otherwise ends with
  // the first run's stop() killing the second run's live stream.
  const startTokenRef = useRef(0);
  const pendingRef = useRef<Promise<void>>(Promise.resolve());

  useBarcode({ onScan, enabled: !cameraActive });

  useEffect(() => {
    if (!cameraActive) return;

    const token = ++startTokenRef.current;
    let controls: IScannerControls | null = null;

    const run = pendingRef.current.then(async () => {
      if (token !== startTokenRef.current) return;

      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
        await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
      if (token !== startTokenRef.current || !videoRef.current) return;

      /**
       * Without a format list ZXing tries every reader it ships — Micro QR,
       * Aztec, PDF417 and the rest — on every frame, and each miss logs a
       * NotFoundException. Naming the formats a shop actually prints cuts both
       * the console noise and the per-frame decode cost.
       */
      const hints = new Map([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.ITF,
            BarcodeFormat.QR_CODE,
          ],
        ],
      ]);

      try {
        controls = await new BrowserMultiFormatReader(hints).decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result) => {
            if (result) {
              onScanRef.current(result.getText());
              setCameraActive(false);
            }
          },
        );
        if (token !== startTokenRef.current) {
          controls.stop();
          controls = null;
        }
      } catch {
        if (token !== startTokenRef.current) return;
        // The usual cause on a till is not a denied prompt but the page being
        // served over plain http on a LAN address, where getUserMedia does not
        // exist at all — worth naming, or the fix looks like a permissions one.
        setCameraError(
          window.isSecureContext
            ? "Camera unavailable — check permissions and try again."
            : "Camera needs https:// or localhost. Open the till over HTTPS, or use a USB scanner.",
        );
        setCameraActive(false);
      }
    });
    pendingRef.current = run;

    return () => {
      // Invalidates this attempt, then stops only once it has settled, so a
      // stop can never land on a stream a later attempt owns.
      startTokenRef.current += 1;
      pendingRef.current = run.then(() => {
        controls?.stop();
        controls = null;
      });
    };
  }, [cameraActive]);

  return (
    <div className="flex flex-col gap-3">
      {cameraActive && (
        <div className="relative aspect-square w-full max-w-xs self-center overflow-hidden rounded-2xl bg-black">
          {/* autoPlay as well as ZXing's own play() call: Safari and some
              Android browsers refuse the programmatic play on a video that was
              never marked to autoplay, and the preview stays black. */}
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
          />
          {/* Viewfinder corners — purely decorative, signals where to hold the code. */}
          <div className="pointer-events-none absolute inset-8 border-2 border-transparent">
            <span className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-white" />
            <span className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-white" />
            <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-white" />
            <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-white" />
          </div>
        </div>
      )}
      {cameraError && <p className="text-xs text-error">{cameraError}</p>}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setCameraError(null);
          setCameraActive((prev) => !prev);
          if (cameraActive) onStop?.();
        }}
      >
        {cameraActive ? "Stop Scanning" : "Scan with camera"}
      </Button>
    </div>
  );
}
