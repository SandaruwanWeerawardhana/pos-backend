"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SEQUENTIAL_RAMP,
  centerOf,
  depthOf,
  fitScale,
  niceScale,
  projectCamera,
  sampleRamp,
  shadeHex,
  type Camera,
  type Point2,
  type Vec3,
} from "./iso";
import { IsoValueLegend } from "./IsoLegend";
import { IsoViewportControls } from "./IsoViewportControls";
import { useIsoViewport } from "./use-iso-viewport";
import type { ProductMetric } from "@/lib/db/reports-3d";

const AXIS_UNITS = 3;
const AUTO_ROTATE_SPEED = 0.0035; /* radians per frame */
const FIT_PADDING = 0.76;
const INITIAL_AZIMUTH = 0.6;
const LABEL_FONT = "11px system-ui, sans-serif";
const TICK_FONT = "10px system-ui, sans-serif";
const LABEL_LINE_HEIGHT = 12;
const PLOT_BACKGROUND = "#0a0a0f";
const MAX_DPR = 2;
const MIN_RADIUS = 3.5;
const MAX_RADIUS = 11;
const LABELLED_POINTS = 5;

interface IsoScatterChartProps {
  points: ProductMetric[];
  autoRotate: boolean;
  height?: number;
  formatMoney: (cents: number) => string;
  showDropLines?: boolean;
  showLabels?: boolean;
  emptyMessage?: string;
  exportName?: string;
}

interface Dot {
  depth: number;
  pos: Point2;
  base: Point2;
  radius: number;
  color: string;
  label: string;
  quantity: number;
  avgPriceCents: number;
  revenueCents: number;
  labelled: boolean;
}

interface HoverState {
  x: number;
  y: number;
  label: string;
  quantity: number;
  avgPriceCents: number;
  revenueCents: number;
}

/**
 * Quantity x Price x Revenue as a genuine 3D point cloud on an HTML canvas.
 * Quantity runs along x, average price into z and revenue up y; bubble size
 * tracks revenue and bubble colour tracks price, because depth is the hardest
 * channel to read at a glance and a redundant colour cue makes the far-back
 * points legible. Auto-rotates around the vertical axis when `autoRotate` is
 * on; any pointer gesture overrides it for its duration.
 */
export function IsoScatterChart({
  points,
  autoRotate,
  height = 280,
  formatMoney,
  showDropLines = true,
  showLabels = true,
  emptyMessage = "No product sales in this period.",
  exportName = "scatter-3d",
}: Readonly<IsoScatterChartProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const hoverRef = useRef<string | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const requestDraw = useCallback(() => drawRef.current(), []);
  const viewport = useIsoViewport({ initialAzimuth: INITIAL_AZIMUTH, onChange: requestDraw });
  const { canvasRef, viewRef, interactingRef } = viewport;

  const quantityScale = useMemo(
    () => niceScale(Math.max(1, ...points.map((point) => point.quantity)), 3),
    [points],
  );
  const priceScale = useMemo(
    () => niceScale(Math.max(1, ...points.map((point) => point.avgPriceCents)), 3),
    [points],
  );
  const revenueScale = useMemo(
    () => niceScale(Math.max(1, ...points.map((point) => point.revenueCents)), 3),
    [points],
  );

  const labelledIds = useMemo(
    () =>
      new Set(
        [...points]
          .sort((a, b) => b.revenueCents - a.revenueCents)
          .slice(0, LABELLED_POINTS)
          .map((point) => point.productId),
      ),
    [points],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const width = container.clientWidth;
    if (width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const deviceWidth = Math.round(width * dpr);
    const deviceHeight = Math.round(height * dpr);
    if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
      canvas.width = deviceWidth;
      canvas.height = deviceHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PLOT_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    const view = viewRef.current;
    const camera: Camera = { azimuth: view.azimuth, pitch: view.pitch };
    const bounds: Vec3[] = [];
    for (const x of [0, AXIS_UNITS]) {
      for (const y of [0, AXIS_UNITS]) {
        for (const z of [0, AXIS_UNITS]) {
          bounds.push({ x, y, z });
        }
      }
    }
    const scale = fitScale(bounds, width, height, FIT_PADDING) * view.zoom;
    const center = centerOf(bounds.map((corner) => projectCamera(corner, camera)));
    const offsetX = width / 2 - center.x * scale + view.panX;
    const offsetY = height / 2 - center.y * scale + view.panY;
    const toScreen = (point: Vec3): Point2 => {
      const projected = projectCamera(point, camera);
      return { x: projected.x * scale + offsetX, y: projected.y * scale + offsetY };
    };
    const boxCenterScreen = toScreen({
      x: AXIS_UNITS / 2,
      y: AXIS_UNITS / 2,
      z: AXIS_UNITS / 2,
    });

    const stroke = (from: Point2, to: Point2, color: string, lineWidth = 1) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    };

    /* Floor plate plus the cube's back edges: without a bounded volume an
       orthographic point cloud gives the eye nothing to judge depth against. */
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.beginPath();
    const floor = [
      toScreen({ x: 0, y: 0, z: 0 }),
      toScreen({ x: AXIS_UNITS, y: 0, z: 0 }),
      toScreen({ x: AXIS_UNITS, y: 0, z: AXIS_UNITS }),
      toScreen({ x: 0, y: 0, z: AXIS_UNITS }),
    ];
    ctx.moveTo(floor[0].x, floor[0].y);
    for (let index = 1; index < floor.length; index++) ctx.lineTo(floor[index].x, floor[index].y);
    ctx.closePath();
    ctx.fill();

    const gridSteps = quantityScale.ticks.length - 1;
    for (let step = 1; step <= gridSteps; step++) {
      const offset = (step / gridSteps) * AXIS_UNITS;
      stroke(
        toScreen({ x: offset, y: 0, z: 0 }),
        toScreen({ x: offset, y: 0, z: AXIS_UNITS }),
        "rgba(255,255,255,0.09)",
      );
      stroke(
        toScreen({ x: 0, y: 0, z: offset }),
        toScreen({ x: AXIS_UNITS, y: 0, z: offset }),
        "rgba(255,255,255,0.09)",
      );
    }
    for (const corner of [
      { x: AXIS_UNITS, z: 0 },
      { x: 0, z: AXIS_UNITS },
      { x: AXIS_UNITS, z: AXIS_UNITS },
    ]) {
      stroke(
        toScreen({ x: corner.x, y: 0, z: corner.z }),
        toScreen({ x: corner.x, y: AXIS_UNITS, z: corner.z }),
        "rgba(255,255,255,0.07)",
      );
    }

    const claimedBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const drawLabel = (
      text: string,
      x: number,
      y: number,
      align: CanvasTextAlign,
      baseline: CanvasTextBaseline,
    ) => {
      const textWidth = ctx.measureText(text).width;
      let left = x;
      if (align === "center") left = x - textWidth / 2;
      else if (align === "right") left = x - textWidth;
      let top = y;
      if (baseline === "middle") top = y - LABEL_LINE_HEIGHT / 2;
      else if (baseline === "bottom") top = y - LABEL_LINE_HEIGHT;
      const box = {
        x0: left - 2,
        y0: top - 2,
        x1: left + textWidth + 2,
        y1: top + LABEL_LINE_HEIGHT + 2,
      };
      const collides = claimedBoxes.some(
        (other) => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0,
      );
      if (collides) return;
      claimedBoxes.push(box);
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.fillText(text, x, y);
    };

    const origin = toScreen({ x: 0, y: 0, z: 0 });
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = 4;

    const axes = [
      {
        label: "Quantity",
        end: { x: AXIS_UNITS, y: 0, z: 0 },
        ticks: quantityScale,
        at: (fraction: number): Vec3 => ({ x: fraction * AXIS_UNITS, y: 0, z: 0 }),
        format: (value: number) => String(Math.round(value)),
      },
      {
        label: "Avg price",
        end: { x: 0, y: 0, z: AXIS_UNITS },
        ticks: priceScale,
        at: (fraction: number): Vec3 => ({ x: 0, y: 0, z: fraction * AXIS_UNITS }),
        format: formatMoney,
      },
      {
        label: "Revenue",
        end: { x: 0, y: AXIS_UNITS, z: 0 },
        ticks: revenueScale,
        at: (fraction: number): Vec3 => ({ x: 0, y: fraction * AXIS_UNITS, z: 0 }),
        format: formatMoney,
      },
    ] as const;

    for (const axis of axes) {
      const end = toScreen(axis.end);
      stroke(origin, end, "rgba(255,255,255,0.34)", 1.2);
      ctx.font = LABEL_FONT;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      const outward = end.x >= boxCenterScreen.x;
      drawLabel(axis.label, end.x + (outward ? 6 : -6), end.y - 4, outward ? "left" : "right", "bottom");

      ctx.font = TICK_FONT;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (const tick of axis.ticks.ticks) {
        if (tick === 0) continue;
        const pos = toScreen(axis.at(tick / axis.ticks.max));
        const left = pos.x <= boxCenterScreen.x;
        drawLabel(axis.format(tick), pos.x + (left ? -5 : 5), pos.y, left ? "right" : "left", "middle");
      }
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    const dots: Dot[] = points.map((point) => {
      const vec: Vec3 = {
        x: (point.quantity / quantityScale.max) * AXIS_UNITS,
        y: (point.revenueCents / revenueScale.max) * AXIS_UNITS,
        z: (point.avgPriceCents / priceScale.max) * AXIS_UNITS,
      };
      const revenueShare = point.revenueCents / revenueScale.max;
      return {
        depth: depthOf(vec, camera),
        pos: toScreen(vec),
        base: toScreen({ ...vec, y: 0 }),
        radius: MIN_RADIUS + Math.sqrt(Math.max(0, revenueShare)) * (MAX_RADIUS - MIN_RADIUS),
        color: sampleRamp(SEQUENTIAL_RAMP, point.avgPriceCents / priceScale.max),
        label: point.name,
        quantity: point.quantity,
        avgPriceCents: point.avgPriceCents,
        revenueCents: point.revenueCents,
        labelled: labelledIds.has(point.productId),
      };
    });
    dots.sort((a, b) => a.depth - b.depth);
    dotsRef.current = dots;

    const hovered = hoverRef.current;
    for (const dot of dots) {
      const isHovered = hovered === dot.label;
      if (showDropLines || isHovered) {
        ctx.setLineDash(isHovered ? [] : [3, 3]);
        stroke(
          dot.pos,
          dot.base,
          isHovered ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.16)",
          isHovered ? 1.4 : 1,
        );
        ctx.setLineDash([]);
        ctx.fillStyle = isHovered ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.2)";
        ctx.beginPath();
        ctx.ellipse(dot.base.x, dot.base.y, dot.radius * 0.55, dot.radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Depth fade plus a lit rim: near points read solid, far points recede. */
      ctx.globalAlpha = hovered && !isHovered ? 0.5 : 0.62 + ((dot.depth + AXIS_UNITS) / (AXIS_UNITS * 3)) * 0.38;
      const gradient = ctx.createRadialGradient(
        dot.pos.x - dot.radius * 0.35,
        dot.pos.y - dot.radius * 0.35,
        dot.radius * 0.2,
        dot.pos.x,
        dot.pos.y,
        dot.radius,
      );
      gradient.addColorStop(0, shadeHex(dot.color, 0.4));
      gradient.addColorStop(1, shadeHex(dot.color, -0.18));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(dot.pos.x, dot.pos.y, dot.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isHovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.28)";
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (showLabels) {
      ctx.font = LABEL_FONT;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.shadowColor = "rgba(0,0,0,0.95)";
      ctx.shadowBlur = 4;
      for (let index = dots.length - 1; index >= 0; index--) {
        const dot = dots[index];
        if (!dot.labelled) continue;
        const text = dot.label.length > 16 ? `${dot.label.slice(0, 15)}…` : dot.label;
        drawLabel(text, dot.pos.x, dot.pos.y - dot.radius - 3, "center", "bottom");
      }
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }
  }, [
    points,
    height,
    quantityScale,
    priceScale,
    revenueScale,
    labelledIds,
    showDropLines,
    showLabels,
    formatMoney,
    canvasRef,
    viewRef,
  ]);

  /*
   * The animation frame loop only runs while auto-rotate is on. With it off the
   * canvas is repainted on demand, so an idle dashboard is not burning a redraw
   * of every chart 60 times a second.
   */
  useEffect(() => {
    drawRef.current = draw;
    if (!autoRotate) {
      draw();
      return;
    }
    let frame = requestAnimationFrame(function loop() {
      if (!interactingRef.current) viewRef.current.azimuth += AUTO_ROTATE_SPEED;
      draw();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [draw, autoRotate, interactingRef, viewRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (viewport.handlePointerMove(event)) {
        if (hoverRef.current) {
          hoverRef.current = null;
          setHover(null);
        }
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const dots = dotsRef.current;
      let nearest: Dot | undefined;
      for (let index = dots.length - 1; index >= 0; index--) {
        const dot = dots[index];
        if (Math.hypot(dot.pos.x - px, dot.pos.y - py) <= dot.radius + 4) {
          nearest = dot;
          break;
        }
      }
      hoverRef.current = nearest?.label ?? null;
      setHover(
        nearest
          ? {
              x: px,
              y: py,
              label: nearest.label,
              quantity: nearest.quantity,
              avgPriceCents: nearest.avgPriceCents,
              revenueCents: nearest.revenueCents,
            }
          : null,
      );
      requestDraw();
    },
    [viewport, requestDraw],
  );

  const handlePointerLeave = useCallback(() => {
    hoverRef.current = null;
    setHover(null);
    requestDraw();
  }, [requestDraw]);

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="3D scatter chart of quantity, average price and revenue. Drag horizontally to rotate and vertically to tilt, scroll or pinch to zoom, shift-drag to pan. Left and right arrows rotate, up and down tilt, plus and minus zoom, zero resets. A data table follows this chart."
          className="cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:cursor-grabbing"
          onPointerDown={viewport.handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={viewport.handlePointerUp}
          onPointerCancel={viewport.handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onKeyDown={viewport.handleKeyDown}
          onContextMenu={viewport.handleContextMenu}
          onDoubleClick={viewport.reset}
        />
        <IsoViewportControls
          zoom={viewport.zoom}
          preset={viewport.preset}
          onZoomIn={viewport.zoomIn}
          onZoomOut={viewport.zoomOut}
          onReset={viewport.reset}
          onPreset={viewport.applyPreset}
          onExport={() => viewport.exportPng(exportName)}
        />
        <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-white/45">
          Drag rotate · Drag up/down tilt · Scroll zoom · Shift-drag pan
        </p>
        {points.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/60">
            {emptyMessage}
          </div>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-black/88 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{ left: hover.x, top: hover.y - 10 }}
          >
            <p className="font-medium">{hover.label}</p>
            <p className="text-white/70">{formatMoney(hover.revenueCents)} revenue</p>
            <p className="text-white/50">
              {hover.quantity} sold · {formatMoney(hover.avgPriceCents)} avg
            </p>
          </div>
        )}
      </div>
      <IsoValueLegend
        min={0}
        max={priceScale.max}
        stops={SEQUENTIAL_RAMP}
        formatter={formatMoney}
        label="Avg price"
      />
      <table className="sr-only">
        <caption>Product quantity, average price and revenue</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Quantity</th>
            <th scope="col">Average price</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.productId}>
              <th scope="row">{point.name}</th>
              <td>{point.quantity}</td>
              <td>{formatMoney(point.avgPriceCents)}</td>
              <td>{formatMoney(point.revenueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
