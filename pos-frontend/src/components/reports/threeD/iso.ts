/**
 * Orthographic camera math shared by the 3D report's canvas charts. A scene
 * point is turned around the vertical axis (azimuth) and then projected at a
 * camera elevation (pitch), so the turntable drag and the tilt drag both feed
 * one projection instead of a hard-coded isometric angle. Pitch is clamped
 * short of 0 and of straight down: at either extreme one axis collapses to a
 * line and the chart stops being readable.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Point2 {
  x: number;
  y: number;
}

export interface Camera {
  azimuth: number;
  pitch: number;
}

export const MIN_PITCH = 0.14;
export const MAX_PITCH = 1.35;
export const DEFAULT_PITCH = 0.58;

/** Perceptual sequential ramp (viridis stops) for value-coloured scenes. */
export const SEQUENTIAL_RAMP = ["#3b0f70", "#3b528b", "#21918c", "#5ec962", "#fde725"];

export function rotateY(point: Vec3, theta: number): Vec3 {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: point.x * cos - point.z * sin,
    y: point.y,
    z: point.x * sin + point.z * cos,
  };
}

export function projectCamera(point: Vec3, camera: Camera): Point2 {
  const rotated = rotateY(point, camera.azimuth);
  return {
    x: rotated.x,
    y: rotated.z * Math.sin(camera.pitch) - point.y * Math.cos(camera.pitch),
  };
}

/** Depth key for painter's-algorithm sorting: larger sorts closer to the viewer. */
export function depthOf(point: Vec3, camera: Camera): number {
  return rotateY(point, camera.azimuth).z;
}

export function centerOf(points: Point2[]): Point2 {
  if (points.length === 0) return { x: 0, y: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Base pixels-per-unit for a scene, chosen as the worst case over every camera
 * the user can reach rather than the current one. Fitting per-frame makes the
 * scene pulse bigger and smaller as its projected footprint changes while
 * dragging; a camera-independent scale keeps it still and makes the zoom anchor
 * maths exact, since only the user's zoom factor moves the scale.
 */
export function fitScale(
  corners: Vec3[],
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
  azimuthSamples = 16,
  pitchSamples = 5,
): number {
  if (corners.length === 0) return 1;
  let smallest = Number.POSITIVE_INFINITY;
  for (let pitchStep = 0; pitchStep < pitchSamples; pitchStep++) {
    const pitch =
      MIN_PITCH + ((MAX_PITCH - MIN_PITCH) * pitchStep) / Math.max(1, pitchSamples - 1);
    for (let sample = 0; sample < azimuthSamples; sample++) {
      const azimuth = (sample / azimuthSamples) * Math.PI * 2;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const corner of corners) {
        const projected = projectCamera(corner, { azimuth, pitch });
        minX = Math.min(minX, projected.x);
        maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y);
        maxY = Math.max(maxY, projected.y);
      }
      const width = Math.max(maxX - minX, 0.001);
      const height = Math.max(maxY - minY, 0.001);
      smallest = Math.min(
        smallest,
        (canvasWidth * padding) / width,
        (canvasHeight * padding) / height,
      );
    }
  }
  return Number.isFinite(smallest) && smallest > 0 ? smallest : 1;
}

/** True when a screen point falls inside a screen-space polygon. */
export function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function channelsOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(channels: number[]): string {
  return `#${channels
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Lightens (amount > 0) or darkens (amount < 0) a #rrggbb colour. */
export function shadeHex(hex: string, amount: number): string {
  return toHex(
    channelsOf(hex).map((channel) =>
      amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount),
    ),
  );
}

export function mixHex(from: string, to: string, t: number): string {
  const a = channelsOf(from);
  const b = channelsOf(to);
  const clamped = Math.min(1, Math.max(0, t));
  return toHex(a.map((channel, index) => channel + (b[index] - channel) * clamped));
}

/** Samples a multi-stop colour ramp at `t` in [0, 1]. */
export function sampleRamp(stops: string[], t: number): string {
  if (stops.length === 0) return "#ffffff";
  if (stops.length === 1) return stops[0];
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mixHex(stops[index], stops[index + 1], scaled - index);
}

/**
 * Rounds an axis maximum up to a human step (1/2/5 x 10^n) and returns the
 * tick values for it, so gridlines land on readable numbers instead of on
 * fractions of whatever the largest bar happens to be.
 */
export function niceScale(max: number, tickCount = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, ticks: [0, 1] };
  const rough = max / Math.max(1, tickCount);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  let step = magnitude;
  if (normalized > 5) step = 10 * magnitude;
  else if (normalized > 2) step = 5 * magnitude;
  else if (normalized > 1) step = 2 * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(value);
  return { max: top, ticks };
}

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}
