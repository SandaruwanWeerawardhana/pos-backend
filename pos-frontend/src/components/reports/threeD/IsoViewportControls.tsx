"use client";

import { Download, Maximize2, Minus, Plus } from "lucide-react";
import { MAX_ZOOM, MIN_ZOOM, type ViewPreset } from "./use-iso-viewport";

interface IsoViewportControlsProps {
  zoom: number;
  preset: ViewPreset;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onPreset: (preset: ViewPreset) => void;
  onExport: () => void;
}

const PRESETS: { value: ViewPreset; label: string; title: string }[] = [
  { value: "iso", label: "3D", title: "Three-quarter view" },
  { value: "front", label: "Front", title: "Front view — honest height comparison" },
  { value: "top", label: "Top", title: "Plan view — spot the hot cells" },
];

const BUTTON_CLASS =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm transition-colors duration-[var(--duration-fast)] hover:bg-black/75 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-35";

export function IsoViewportControls({
  zoom,
  preset,
  onZoomIn,
  onZoomOut,
  onReset,
  onPreset,
  onExport,
}: Readonly<IsoViewportControlsProps>) {
  return (
    <div className="absolute right-2 top-2 z-10 flex flex-wrap items-center justify-end gap-1.5">
      <div
        className="flex overflow-hidden rounded-lg border border-white/15 bg-black/55 backdrop-blur-sm"
        role="group"
        aria-label="Camera presets"
      >
        {PRESETS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPreset(option.value)}
            aria-pressed={preset === option.value}
            title={option.title}
            className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              preset === option.value
                ? "bg-white/85 text-black"
                : "text-white/75 hover:bg-white/15 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="rounded-lg border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-semibold tabular-nums text-white/85 backdrop-blur-sm">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoom <= MIN_ZOOM + 0.001}
        aria-label="Zoom out"
        title="Zoom out"
        className={BUTTON_CLASS}
      >
        <Minus size={15} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoom >= MAX_ZOOM - 0.001}
        aria-label="Zoom in"
        title="Zoom in"
        className={BUTTON_CLASS}
      >
        <Plus size={15} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset view"
        title="Reset view"
        className={BUTTON_CLASS}
      >
        <Maximize2 size={14} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onExport}
        aria-label="Download chart as PNG"
        title="Download PNG"
        className={BUTTON_CLASS}
      >
        <Download size={14} aria-hidden />
      </button>
    </div>
  );
}
