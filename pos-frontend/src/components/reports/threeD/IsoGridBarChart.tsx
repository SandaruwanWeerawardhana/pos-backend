"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SEQUENTIAL_RAMP,
  centerOf,
  depthOf,
  easeOutCubic,
  fitScale,
  niceScale,
  pointInPolygon,
  projectCamera,
  rotateY,
  sampleRamp,
  shadeHex,
  type Camera,
  type Point2,
  type Vec3,
} from "./iso";
import { IsoSeriesLegend, IsoValueLegend } from "./IsoLegend";
import { IsoViewportControls } from "./IsoViewportControls";
import { useIsoViewport } from "./use-iso-viewport";
import type { Grid3D } from "@/lib/db/reports-3d";

const MAX_HEIGHT_UNITS = 3;
const BAR_SIZE = 0.62; /* footprint width/depth of a bar, cell pitch is 1 */
const FIT_PADDING = 0.8;
const LABEL_FONT = "11px system-ui, sans-serif";
const VALUE_FONT = "600 10px system-ui, sans-serif";
const LABEL_LINE_HEIGHT = 12;
const INITIAL_AZIMUTH = -0.55;
const GROW_DURATION = 650;
const AUTO_ROTATE_SPEED = 0.0025;
const PLOT_BACKGROUND = "#0a0a0f";
const MAX_DPR = 2;
/** Light direction in view space, so the lit side follows the camera. */
const LIGHT_X = -0.55;
const LIGHT_Z = 0.84;
const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

export type BarColorMode = "series" | "value";

interface IsoGridBarChartProps {
  grid: Grid3D;
  rowColors: string[];
  valueFormatter: (value: number) => string;
  tickFormatter?: (value: number) => string;
  axisLabel?: string;
  height?: number;
  emptyMessage?: string;
  colorMode?: BarColorMode;
  showValues?: boolean;
  showLegend?: boolean;
  autoRotate?: boolean;
  exportName?: string;
}

interface Series {
  key: string;
  label: string;
  color: string;
  rowIndex: number;
  total: number;
}

interface BarGeometry {
  depth: number;
  color: string;
  rowKey: string;
  rowLabel: string;
  columnLabel: string;
  columnIndex: number;
  value: number;
  columnShare: number;
  rowShare: number;
  topCenter: Point2;
  barHeight: number;
  faces: { points: Point2[]; shade: number }[];
  footprint: Point2[];
}

interface BarHit {
  faces: Point2[][];
  rowKey: string;
  rowLabel: string;
  columnLabel: string;
  columnIndex: number;
  value: number;
  columnShare: number;
  rowShare: number;
}

interface HoverState {
  x: number;
  y: number;
  rowKey: string;
  columnIndex: number;
  rowLabel: string;
  columnLabel: string;
  value: number;
  columnShare: number;
  rowShare: number;
}

function fillPolygon(
  ctx: CanvasRenderingContext2D,
  points: Point2[],
  fill: string | CanvasGradient,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
  ctx.fill();
}

function strokePolygon(
  ctx: CanvasRenderingContext2D,
  points: Point2[],
  stroke: string,
  width = 1,
) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
  ctx.stroke();
}

function line(ctx: CanvasRenderingContext2D, from: Point2, to: Point2, stroke: string, width = 1) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/**
 * A month/hour x warehouse/product/day grid rendered as extruded bars on an
 * HTML canvas. Drag horizontally to turn the scene, vertically to tilt the
 * camera between a near-flat front view (where heights compare honestly) and a
 * plan view; wheel/pinch zooms and shift-drag pans. The value axis, the two
 * back walls and both label rails re-attach to whichever side is currently
 * facing away from the viewer, so nothing ends up hidden behind the bars.
 */
export function IsoGridBarChart({
  grid,
  rowColors,
  valueFormatter,
  tickFormatter,
  axisLabel,
  height = 320,
  emptyMessage = "No data for this period.",
  colorMode = "series",
  showValues = false,
  showLegend = true,
  autoRotate = false,
  exportName = "chart-3d",
}: Readonly<IsoGridBarChartProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<BarHit[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const hoverRef = useRef<{ rowKey: string; columnIndex: number } | null>(null);
  const growRef = useRef({ start: 0, progress: 1 });
  const [hover, setHover] = useState<HoverState | null>(null);
  /* Series visibility is keyed to the row set it was chosen for, so a range or
     warehouse change that swaps the rows out drops the old selection without an
     effect having to reset it. */
  const [hiddenState, setHiddenState] = useState<{
    signature: string;
    keys: ReadonlySet<string>;
  }>({ signature: "", keys: EMPTY_KEYS });

  const requestDraw = useCallback(() => drawRef.current(), []);
  const viewport = useIsoViewport({ initialAzimuth: INITIAL_AZIMUTH, onChange: requestDraw });
  const { canvasRef, viewRef, interactingRef } = viewport;
  const formatTick = tickFormatter ?? valueFormatter;

  const rowKeySignature = grid.rows.map((row) => row.key).join("|");
  const hiddenRows = hiddenState.signature === rowKeySignature ? hiddenState.keys : EMPTY_KEYS;

  const allSeries = useMemo<Series[]>(
    () =>
      grid.rows.map((row, rowIndex) => ({
        key: row.key,
        label: row.label,
        color:
          colorMode === "value"
            ? sampleRamp(SEQUENTIAL_RAMP, grid.rows.length > 1 ? rowIndex / (grid.rows.length - 1) : 1)
            : rowColors[rowIndex % rowColors.length],
        rowIndex,
        total: (grid.values[rowIndex] ?? []).reduce((sum, value) => sum + value, 0),
      })),
    [grid.rows, grid.values, rowColors, colorMode],
  );

  const series = useMemo(
    () => allSeries.filter((item) => !hiddenRows.has(item.key)),
    [allSeries, hiddenRows],
  );

  const maxValue = useMemo(() => {
    let max = 0;
    for (const item of series) {
      for (const value of grid.values[item.rowIndex] ?? []) max = Math.max(max, value);
    }
    return max;
  }, [series, grid.values]);

  const scaleInfo = useMemo(() => niceScale(maxValue), [maxValue]);

  const columnTotals = useMemo(
    () =>
      grid.columns.map((_, columnIndex) =>
        series.reduce((sum, item) => sum + (grid.values[item.rowIndex]?.[columnIndex] ?? 0), 0),
      ),
    [grid.columns, grid.values, series],
  );

  const toggleRow = useCallback(
    (key: string) => {
      setHiddenState((current) => {
        const keys = new Set(current.signature === rowKeySignature ? current.keys : EMPTY_KEYS);
        if (keys.has(key)) keys.delete(key);
        else keys.add(key);
        return { signature: rowKeySignature, keys };
      });
    },
    [rowKeySignature],
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

    const cols = grid.columns.length;
    const rows = series.length;
    if (cols === 0 || rows === 0) {
      barsRef.current = [];
      return;
    }
    const view = viewRef.current;
    const camera: Camera = { azimuth: view.azimuth, pitch: view.pitch };
    const halfW = cols / 2;
    const halfD = rows / 2;
    const progress = easeOutCubic(growRef.current.progress);

    const sceneCorners: Vec3[] = [];
    for (const x of [-halfW - 1, halfW + 1]) {
      for (const z of [-halfD - 1, halfD + 1]) {
        for (const y of [0, MAX_HEIGHT_UNITS]) {
          sceneCorners.push({ x, y, z });
        }
      }
    }
    const scale = fitScale(sceneCorners, width, height, FIT_PADDING) * view.zoom;
    const center = centerOf(sceneCorners.map((corner) => projectCamera(corner, camera)));
    const offsetX = width / 2 - center.x * scale + view.panX;
    const offsetY = height / 2 - center.y * scale + view.panY;
    const toScreen = (point: Vec3): Point2 => {
      const projected = projectCamera(point, camera);
      return { x: projected.x * scale + offsetX, y: projected.y * scale + offsetY };
    };
    const sceneCenterScreen = toScreen({ x: 0, y: 0, z: 0 });

    /*
     * The two walls the camera is looking at from behind carry the gridlines;
     * their shared corner carries the value axis. Everything else (column rail,
     * row rail) hangs off the opposite, near edges.
     */
    const farZ = depthOf({ x: 0, y: 0, z: -halfD }, camera) < depthOf({ x: 0, y: 0, z: halfD }, camera)
      ? -halfD
      : halfD;
    const farX = depthOf({ x: -halfW, y: 0, z: 0 }, camera) < depthOf({ x: halfW, y: 0, z: 0 }, camera)
      ? -halfW
      : halfW;
    const nearZ = -farZ;
    const nearX = -farX;

    fillPolygon(
      ctx,
      [
        toScreen({ x: -halfW, y: 0, z: -halfD }),
        toScreen({ x: halfW, y: 0, z: -halfD }),
        toScreen({ x: halfW, y: 0, z: halfD }),
        toScreen({ x: -halfW, y: 0, z: halfD }),
      ],
      "rgba(255,255,255,0.035)",
    );

    for (const wall of [
      [
        { x: -halfW, y: 0, z: farZ },
        { x: halfW, y: 0, z: farZ },
      ],
      [
        { x: farX, y: 0, z: -halfD },
        { x: farX, y: 0, z: halfD },
      ],
    ] as const) {
      const [start, end] = wall;
      fillPolygon(
        ctx,
        [
          toScreen(start),
          toScreen(end),
          toScreen({ ...end, y: MAX_HEIGHT_UNITS }),
          toScreen({ ...start, y: MAX_HEIGHT_UNITS }),
        ],
        "rgba(255,255,255,0.045)",
      );
      for (const tick of scaleInfo.ticks) {
        const y = (tick / scaleInfo.max) * MAX_HEIGHT_UNITS;
        line(
          ctx,
          toScreen({ ...start, y }),
          toScreen({ ...end, y }),
          tick === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)",
        );
      }
    }

    for (let c = 0; c <= cols; c++) {
      const x = c - halfW;
      line(
        ctx,
        toScreen({ x, y: 0, z: -halfD }),
        toScreen({ x, y: 0, z: halfD }),
        "rgba(255,255,255,0.1)",
      );
    }
    for (let r = 0; r <= rows; r++) {
      const z = r - halfD;
      line(
        ctx,
        toScreen({ x: -halfW, y: 0, z }),
        toScreen({ x: halfW, y: 0, z }),
        "rgba(255,255,255,0.1)",
      );
    }

    const axisBase: Vec3 = { x: farX * 1.06, y: 0, z: farZ * 1.06 };
    const axisBottom = toScreen(axisBase);
    const axisTop = toScreen({ ...axisBase, y: MAX_HEIGHT_UNITS });
    line(ctx, axisBottom, axisTop, "rgba(255,255,255,0.4)", 1.2);

    /*
     * Labels are drawn against a dark plot with bars behind them, so each one
     * gets a shadow for contrast and claims a box first — anything that would
     * collide with an already-drawn label is dropped rather than smeared over
     * it, which is what happens when a dense grid is rotated edge-on.
     */
    const claimedBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const drawLabel = (
      text: string,
      x: number,
      y: number,
      align: CanvasTextAlign,
      baseline: CanvasTextBaseline,
    ): boolean => {
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
      if (collides) return false;
      claimedBoxes.push(box);
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.fillText(text, x, y);
      return true;
    };

    ctx.font = LABEL_FONT;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = 4;

    const axisOnLeft = axisBottom.x <= sceneCenterScreen.x;
    for (const tick of scaleInfo.ticks) {
      const pos = toScreen({ ...axisBase, y: (tick / scaleInfo.max) * MAX_HEIGHT_UNITS });
      drawLabel(
        formatTick(tick),
        pos.x + (axisOnLeft ? -6 : 6),
        pos.y,
        axisOnLeft ? "right" : "left",
        "middle",
      );
    }
    if (axisLabel) {
      drawLabel(axisLabel, axisTop.x, axisTop.y - 14, "center", "bottom");
    }

    grid.columns.forEach((column, index) => {
      const pos = toScreen({
        x: index - halfW + 0.5,
        y: 0,
        z: nearZ + Math.sign(nearZ) * 0.62,
      });
      const below = pos.y >= sceneCenterScreen.y;
      drawLabel(column.label, pos.x, pos.y + (below ? 4 : -4), "center", below ? "top" : "bottom");
    });

    series.forEach((item, index) => {
      const pos = toScreen({
        x: nearX + Math.sign(nearX) * 0.72,
        y: 0,
        z: index - halfD + 0.5,
      });
      const text = item.label.length > 14 ? `${item.label.slice(0, 13)}…` : item.label;
      const left = pos.x <= sceneCenterScreen.x;
      drawLabel(text, pos.x + (left ? -4 : 4), pos.y, left ? "right" : "left", "middle");
    });

    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    const bars: BarGeometry[] = [];
    series.forEach((item, seriesIndex) => {
      const rowValues = grid.values[item.rowIndex] ?? [];
      const rowTotal = item.total;
      grid.columns.forEach((column, colIndex) => {
        const value = rowValues[colIndex] ?? 0;
        if (value <= 0) return;
        const barHeight = (value / scaleInfo.max) * MAX_HEIGHT_UNITS * progress;
        const cx = colIndex - halfW + 0.5;
        const cz = seriesIndex - halfD + 0.5;
        const x0 = cx - BAR_SIZE / 2;
        const x1 = cx + BAR_SIZE / 2;
        const z0 = cz - BAR_SIZE / 2;
        const z1 = cz + BAR_SIZE / 2;
        const color =
          colorMode === "value"
            ? sampleRamp(SEQUENTIAL_RAMP, value / Math.max(1, maxValue))
            : item.color;

        const faces: BarGeometry["faces"] = [];
        for (const [normalX, normalZ] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const rotated = rotateY({ x: normalX, y: 0, z: normalZ }, camera.azimuth);
          if (rotated.z <= 0.001) continue;
          const lit = rotated.x * LIGHT_X + rotated.z * LIGHT_Z;
          const edge: [Vec3, Vec3] =
            normalX !== 0
              ? [
                  { x: normalX > 0 ? x1 : x0, y: 0, z: z0 },
                  { x: normalX > 0 ? x1 : x0, y: 0, z: z1 },
                ]
              : [
                  { x: x0, y: 0, z: normalZ > 0 ? z1 : z0 },
                  { x: x1, y: 0, z: normalZ > 0 ? z1 : z0 },
                ];
          faces.push({
            points: [
              toScreen({ ...edge[0], y: barHeight }),
              toScreen({ ...edge[1], y: barHeight }),
              toScreen(edge[1]),
              toScreen(edge[0]),
            ],
            shade: -0.34 + 0.2 * lit,
          });
        }
        faces.push({
          points: [
            toScreen({ x: x0, y: barHeight, z: z0 }),
            toScreen({ x: x1, y: barHeight, z: z0 }),
            toScreen({ x: x1, y: barHeight, z: z1 }),
            toScreen({ x: x0, y: barHeight, z: z1 }),
          ],
          shade: 0.2,
        });

        bars.push({
          depth: depthOf({ x: cx, y: 0, z: cz }, camera),
          color,
          rowKey: item.key,
          rowLabel: item.label,
          columnLabel: column.label,
          columnIndex: colIndex,
          value,
          columnShare: columnTotals[colIndex] > 0 ? value / columnTotals[colIndex] : 0,
          rowShare: rowTotal > 0 ? value / rowTotal : 0,
          topCenter: toScreen({ x: cx, y: barHeight, z: cz }),
          barHeight,
          faces,
          footprint: [
            toScreen({ x: x0, y: 0, z: z0 }),
            toScreen({ x: x1, y: 0, z: z0 }),
            toScreen({ x: x1, y: 0, z: z1 }),
            toScreen({ x: x0, y: 0, z: z1 }),
          ],
        });
      });
    });
    bars.sort((a, b) => a.depth - b.depth);

    for (const bar of bars) {
      fillPolygon(ctx, bar.footprint, "rgba(0,0,0,0.4)");
    }

    const hovered = hoverRef.current;
    for (const bar of bars) {
      const isHovered =
        hovered !== null && hovered.rowKey === bar.rowKey && hovered.columnIndex === bar.columnIndex;
      ctx.globalAlpha = hovered && !isHovered ? 0.72 : 1;
      for (const face of bar.faces) {
        const boost = isHovered ? 0.16 : 0;
        const top = shadeHex(bar.color, Math.min(0.9, face.shade + 0.12 + boost));
        const bottom = shadeHex(bar.color, Math.min(0.9, face.shade - 0.1 + boost));
        const gradient = ctx.createLinearGradient(
          face.points[0].x,
          face.points[0].y,
          face.points[2].x,
          face.points[2].y,
        );
        gradient.addColorStop(0, top);
        gradient.addColorStop(1, bottom);
        fillPolygon(ctx, face.points, gradient);
      }
      strokePolygon(
        ctx,
        bar.faces[bar.faces.length - 1].points,
        isHovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.16)",
        isHovered ? 1.6 : 1,
      );
      ctx.globalAlpha = 1;
    }

    if (showValues && progress >= 1) {
      ctx.font = VALUE_FONT;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.shadowColor = "rgba(0,0,0,0.95)";
      ctx.shadowBlur = 4;
      for (let index = bars.length - 1; index >= 0; index--) {
        const bar = bars[index];
        drawLabel(formatTick(bar.value), bar.topCenter.x, bar.topCenter.y - 6, "center", "bottom");
      }
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    /* Hovered bar gets a dashed leader to the value axis so its height can be
       read off the scale instead of guessed at. */
    const hoveredBar = hovered
      ? bars.find(
          (bar) => bar.rowKey === hovered.rowKey && bar.columnIndex === hovered.columnIndex,
        )
      : undefined;
    if (hoveredBar) {
      const axisPoint = toScreen({ ...axisBase, y: hoveredBar.barHeight });
      ctx.setLineDash([4, 4]);
      line(ctx, hoveredBar.topCenter, axisPoint, "rgba(255,255,255,0.55)", 1.2);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(axisPoint.x, axisPoint.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    barsRef.current = bars.map((bar) => ({
      faces: bar.faces.map((face) => face.points),
      rowKey: bar.rowKey,
      rowLabel: bar.rowLabel,
      columnLabel: bar.columnLabel,
      columnIndex: bar.columnIndex,
      value: bar.value,
      columnShare: bar.columnShare,
      rowShare: bar.rowShare,
    }));
  }, [
    grid.columns,
    grid.values,
    series,
    columnTotals,
    scaleInfo,
    maxValue,
    colorMode,
    showValues,
    formatTick,
    axisLabel,
    height,
    canvasRef,
    viewRef,
  ]);

  useEffect(() => {
    growRef.current = { start: performance.now(), progress: 0 };
  }, [grid]);

  /*
   * One frame loop covers both the grow-in transition and auto-rotate, and it
   * stops as soon as neither needs it — an idle dashboard is not burning a
   * redraw of every chart 60 times a second.
   */
  useEffect(() => {
    drawRef.current = draw;
    let frame = 0;
    const tick = () => {
      const grow = growRef.current;
      if (grow.progress < 1) {
        grow.progress = Math.min(1, (performance.now() - grow.start) / GROW_DURATION);
      }
      if (autoRotate && !interactingRef.current) {
        viewRef.current.azimuth += AUTO_ROTATE_SPEED;
      }
      draw();
      if (grow.progress < 1 || autoRotate) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
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
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      /* Bars are painted far-to-near, so scan back-to-front to hit the topmost one. */
      const bars = barsRef.current;
      for (let index = bars.length - 1; index >= 0; index--) {
        const bar = bars[index];
        if (bar.faces.some((face) => pointInPolygon(point, face))) {
          hoverRef.current = { rowKey: bar.rowKey, columnIndex: bar.columnIndex };
          setHover({
            x: point.x,
            y: point.y,
            rowKey: bar.rowKey,
            columnIndex: bar.columnIndex,
            rowLabel: bar.rowLabel,
            columnLabel: bar.columnLabel,
            value: bar.value,
            columnShare: bar.columnShare,
            rowShare: bar.rowShare,
          });
          requestDraw();
          return;
        }
      }
      if (hoverRef.current) {
        hoverRef.current = null;
        setHover(null);
        requestDraw();
      }
    },
    [viewport, requestDraw],
  );

  const handlePointerLeave = useCallback(() => {
    hoverRef.current = null;
    setHover(null);
    requestDraw();
  }, [requestDraw]);

  const isEmpty = series.every((item) =>
    (grid.values[item.rowIndex] ?? []).every((value) => value <= 0),
  );

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
          aria-label="3D bar chart. Drag horizontally to rotate and vertically to tilt, scroll or pinch to zoom, shift-drag to pan. Left and right arrows rotate, up and down tilt, plus and minus zoom, zero resets. A data table follows this chart."
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
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/60">
            {allSeries.length > 0 && series.length === 0
              ? "Every series is hidden — pick one from the key below."
              : emptyMessage}
          </div>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-black/88 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{ left: hover.x, top: hover.y - 10 }}
          >
            <p className="font-medium">{hover.rowLabel}</p>
            <p className="text-white/70">
              {hover.columnLabel} · {valueFormatter(hover.value)}
            </p>
            <p className="text-white/50">
              {Math.round(hover.columnShare * 100)}% of {hover.columnLabel} ·{" "}
              {Math.round(hover.rowShare * 100)}% of row
            </p>
          </div>
        )}
      </div>
      {showLegend && colorMode === "series" && allSeries.length > 1 && (
        <IsoSeriesLegend
          items={allSeries}
          hidden={hiddenRows}
          onToggle={toggleRow}
          formatter={valueFormatter}
        />
      )}
      {showLegend && colorMode === "value" && (
        <IsoValueLegend
          min={0}
          max={scaleInfo.max}
          stops={SEQUENTIAL_RAMP}
          formatter={formatTick}
          label={axisLabel}
        />
      )}
      <table className="sr-only">
        <caption>{axisLabel ?? "Chart data"}</caption>
        <thead>
          <tr>
            <th scope="col">Series</th>
            {grid.columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allSeries.map((item) => (
            <tr key={item.key}>
              <th scope="row">{item.label}</th>
              {grid.columns.map((column, columnIndex) => (
                <td key={column.key}>
                  {valueFormatter(grid.values[item.rowIndex]?.[columnIndex] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
