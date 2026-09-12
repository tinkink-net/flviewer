import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PanZoom } from "../src/panzoom";

/**
 * happy-dom has no layout engine; every PanZoom fit computation reads the
 * stage's bounding rect, so each test mocks a fixed 600x400 stage.
 * With the default margin (24), avail = 552x352.
 */
function mockStageRect(width = 600, height = 400): void {
  const rect = { left: 0, top: 0, width, height };
  Element.prototype.getBoundingClientRect = () => rect as DOMRect;
}

let pz: PanZoom | null = null;

function makePanZoom(opts = {}): PanZoom {
  const stage = document.createElement("div");
  const media = document.createElement("div");
  stage.append(media);
  pz = new PanZoom(stage, media, opts);
  return pz;
}

beforeEach(() => {
  mockStageRect();
});

afterEach(() => {
  pz = null;
});

describe("fitFactor", () => {
  it("upscales small media to fill the stage (> 1)", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(100, 80);
    // min(552/100, 352/80) = 4.4 — small images upscale to fill (the fix).
    expect(pz2.fitFactor()).toBe(4.4);
  });

  it("still downscales large media (< 1)", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(2000, 1600);
    expect(pz2.fitFactor()).toBeCloseTo(0.22, 5);
  });

  it("is bounded by the tightest axis and rotation-aware", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(100, 100);
    // min(552/100, 352/100) = 3.52.
    expect(pz2.fitFactor()).toBe(3.52);
    pz2.rotate90();
    expect(pz2.fitFactor()).toBe(3.52);
  });

  it("returns 1 for unset media or a zero-size stage", () => {
    const pz2 = makePanZoom();
    expect(pz2.fitFactor()).toBe(1);
    mockStageRect(20, 20);
    pz2.setMediaSize(100, 80);
    expect(pz2.fitFactor()).toBe(1);
  });
});

describe("fit", () => {
  it("applies the fit factor as scale", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(100, 80);
    pz2.fit();
    expect(pz2.totalScale).toBe(4.4);
  });

  it("clamps upscale at maxScale", () => {
    const pz2 = makePanZoom({ maxScale: 2 });
    pz2.setMediaSize(100, 80);
    pz2.fit();
    expect(pz2.totalScale).toBe(2);
  });

  it("clamps downscale at minScale", () => {
    const pz2 = makePanZoom({ minScale: 0.5 });
    pz2.setMediaSize(2000, 1600);
    pz2.fit();
    expect(pz2.totalScale).toBe(0.5);
  });

  it("centers the media (zero translation)", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(100, 80);
    pz2.fit();
    // (tx, ty) = (0, 0) == media center on stage center.
    expect(pz2.media.style.transform).toContain("translate(0px, 0px)");
  });

  it("ignores unset media", () => {
    const pz2 = makePanZoom();
    pz2.fit();
    expect(pz2.totalScale).toBe(1);
  });
});

describe("setHundred", () => {
  it("resets to 1x from any scale", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(100, 80);
    pz2.fit();
    pz2.setHundred();
    expect(pz2.totalScale).toBe(1);
    expect(pz2.media.style.transform).toContain("scale(1)");
  });
});
