import {
  DEFAULT_PITCH,
  MAX_PITCH,
  MIN_PITCH,
  centerOf,
  depthOf,
  fitScale,
  mixHex,
  niceScale,
  pointInPolygon,
  projectCamera,
  sampleRamp,
  shadeHex,
  type Camera,
} from "@/components/reports/threeD/iso";

const CAMERA: Camera = { azimuth: -0.55, pitch: DEFAULT_PITCH };

describe("projectCamera", () => {
  it("keeps taller bars higher on screen at every reachable pitch", () => {
    for (const pitch of [MIN_PITCH, DEFAULT_PITCH, MAX_PITCH]) {
      const camera: Camera = { azimuth: 0.9, pitch };
      const low = projectCamera({ x: 1, y: 1, z: 1 }, camera);
      const high = projectCamera({ x: 1, y: 2, z: 1 }, camera);
      expect(high.y).toBeLessThan(low.y);
    }
  });

  it("leaves the vertical axis unrotated, so height never becomes horizontal", () => {
    const bottom = projectCamera({ x: 0, y: 0, z: 0 }, CAMERA);
    const top = projectCamera({ x: 0, y: 3, z: 0 }, CAMERA);
    expect(top.x).toBeCloseTo(bottom.x, 10);
  });

  it("turns the ground plane a full circle back onto itself", () => {
    const point = { x: 1.5, y: 0, z: -0.5 };
    const start = projectCamera(point, CAMERA);
    const full = projectCamera(point, { ...CAMERA, azimuth: CAMERA.azimuth + Math.PI * 2 });
    expect(full.x).toBeCloseTo(start.x, 8);
    expect(full.y).toBeCloseTo(start.y, 8);
  });
});

describe("depthOf", () => {
  it("puts the cell the camera faces in front of the one behind it", () => {
    const front = depthOf({ x: 0, y: 0, z: 1 }, { azimuth: 0, pitch: DEFAULT_PITCH });
    const back = depthOf({ x: 0, y: 0, z: -1 }, { azimuth: 0, pitch: DEFAULT_PITCH });
    expect(front).toBeGreaterThan(back);
  });

  it("swaps that order after half a turn", () => {
    const camera: Camera = { azimuth: Math.PI, pitch: DEFAULT_PITCH };
    expect(depthOf({ x: 0, y: 0, z: 1 }, camera)).toBeLessThan(
      depthOf({ x: 0, y: 0, z: -1 }, camera),
    );
  });
});

describe("fitScale", () => {
  const corners = [-2, 2].flatMap((x) => [-2, 2].flatMap((z) => [0, 3].map((y) => ({ x, y, z }))));

  it("returns one scale for the whole camera range, so dragging cannot pulse the scene", () => {
    const scale = fitScale(corners, 600, 300, 0.8);
    expect(scale).toBeGreaterThan(0);
    for (const pitch of [MIN_PITCH, DEFAULT_PITCH, MAX_PITCH]) {
      for (let step = 0; step < 12; step++) {
        const camera: Camera = { azimuth: (step / 12) * Math.PI * 2, pitch };
        const projected = corners.map((corner) => projectCamera(corner, camera));
        const xs = projected.map((point) => point.x * scale);
        const ys = projected.map((point) => point.y * scale);
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(600);
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(300);
      }
    }
  });

  it("falls back to 1 for an empty scene rather than dividing by zero", () => {
    expect(fitScale([], 400, 200, 0.8)).toBe(1);
  });
});

describe("centerOf", () => {
  it("returns the mid-point of the projected bounding box", () => {
    expect(centerOf([{ x: -2, y: 0 }, { x: 4, y: 10 }])).toEqual({ x: 1, y: 5 });
  });
});

describe("pointInPolygon", () => {
  const quad = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("hits inside and misses outside", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, quad)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, quad)).toBe(false);
  });
});

describe("niceScale", () => {
  it("rounds the axis top up to a readable step", () => {
    expect(niceScale(87).max).toBe(100);
    expect(niceScale(1234).max).toBe(1500);
  });

  it("starts at zero and ends on the axis top", () => {
    const scale = niceScale(87);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max);
  });

  it("stays usable for an empty period", () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
  });
});

describe("colour helpers", () => {
  it("lightens and darkens without leaving the byte range", () => {
    expect(shadeHex("#3987e5", 1)).toBe("#ffffff");
    expect(shadeHex("#3987e5", -1)).toBe("#000000");
  });

  it("mixes at both ends and the middle", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps ramp samples to the first and last stop", () => {
    const stops = ["#000000", "#808080", "#ffffff"];
    expect(sampleRamp(stops, -1)).toBe("#000000");
    expect(sampleRamp(stops, 2)).toBe("#ffffff");
    expect(sampleRamp(stops, 0.5)).toBe("#808080");
  });
});
