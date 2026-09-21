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

  it("fills the stage regardless of maxScale (tiny media must fill)", () => {
    const pz2 = makePanZoom({ maxScale: 2 });
    pz2.setMediaSize(100, 80);
    pz2.fit();
    expect(pz2.totalScale).toBe(4.4);
  });

  it("fills the stage even below minScale (huge media must fit)", () => {
    const pz2 = makePanZoom({ minScale: 0.5 });
    pz2.setMediaSize(2000, 1600);
    pz2.fit();
    expect(pz2.totalScale).toBeCloseTo(0.22, 5);
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

describe("zoom bounds relative to fit", () => {
  it("caps user zoom at maxScale × fitFactor", () => {
    const pz2 = makePanZoom({ maxScale: 2 });
    pz2.setMediaSize(100, 80); // fit 4.4 → cap 8.8.
    pz2.fit();
    pz2.zoomBy(1000);
    expect(pz2.totalScale).toBeCloseTo(8.8, 5);
  });

  it("lets fit-upscaled media zoom in (no dead wheel at an absolute cap)", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(32, 32); // fit = 352/32 = 11 > default maxScale 8.
    pz2.fit();
    expect(pz2.totalScale).toBe(11);
    pz2.zoomBy(1.5);
    expect(pz2.totalScale).toBeCloseTo(16.5, 5);
  });

  it("never zooms out past minScale, nor past fit when fit is smaller", () => {
    const pz2 = makePanZoom({ minScale: 0.5 });
    pz2.setMediaSize(100, 80);
    pz2.fit();
    pz2.zoomBy(0.000001);
    expect(pz2.totalScale).toBe(0.5);
    // Huge media fits at 0.22 (< minScale): fit itself is the floor.
    pz2.setMediaSize(2000, 1600);
    pz2.fit();
    pz2.zoomBy(0.000001);
    expect(pz2.totalScale).toBeCloseTo(0.22, 5);
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

describe("setScale", () => {
  it("applies an absolute scale, re-centered", () => {
    const pz2 = makePanZoom();
    pz2.setMediaSize(100, 80);
    pz2.setScale(2.5);
    expect(pz2.totalScale).toBe(2.5);
    expect(pz2.media.style.transform).toContain("translate(0px, 0px)");
    expect(pz2.media.style.transform).toContain("scale(2.5)");
  });
});

/**
 * Pointer drag helpers. happy-dom has PointerEvent but no
 * setPointerCapture, so the stage gets a no-op stub.
 */
function drag(stage: HTMLElement, from: [number, number], to: [number, number]): void {
  (stage as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  const opts = { pointerId: 1, pointerType: "mouse", button: 0, bubbles: true };
  stage.dispatchEvent(
    new PointerEvent("pointerdown", { ...opts, clientX: from[0], clientY: from[1] }),
  );
  stage.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: to[0], clientY: to[1] }));
  stage.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: to[0], clientY: to[1] }));
}

describe("clamped panning", () => {
  it("cannot move media that fits the stage", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media);
    pz2.setMediaSize(100, 80);
    pz2.setScale(2); // 200x160 inside 600x400 — nothing to reveal.
    drag(stage, [300, 200], [150, 80]);
    expect(media.style.transform).toContain("translate(0px, 0px)");
  });

  it("clamps overflowing media to its edges (no void around it)", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media);
    pz2.setMediaSize(1000, 800);
    pz2.setScale(1); // 1000x800 overflows 600x400 → max pan ±200/±200.
    drag(stage, [300, 200], [-200, -300]);
    expect(media.style.transform).toContain("translate(-200px, -200px)");
  });

  it("select mode never pans", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media, { mode: "select" });
    expect(pz2.mode).toBe("select");
    pz2.setMediaSize(1000, 800);
    pz2.setScale(1);
    drag(stage, [300, 200], [100, 100]);
    expect(media.style.transform).toContain("translate(0px, 0px)");
  });

  it("setMode switches classes and re-enables panning", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media, { mode: "select" });
    expect(stage.classList.contains("flv-mode-select")).toBe(true);
    pz2.setMode("hand");
    expect(stage.classList.contains("flv-mode-hand")).toBe(true);
    expect(stage.classList.contains("flv-mode-select")).toBe(false);
    pz2.setMediaSize(1000, 800);
    pz2.setScale(1);
    drag(stage, [300, 200], [100, 100]);
    // Delta (-200, -100): x clamps at the edge, y is within bounds.
    expect(media.style.transform).toContain("translate(-200px, -100px)");
  });

  it("select mode wheel scrolls (pans) instead of zooming; hand mode zooms", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media, { mode: "select" });
    pz2.setMediaSize(100, 80);
    stage.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, clientX: 300, clientY: 200 }));
    expect(pz2.totalScale).toBe(1);
    // The wheel delta became a pan (clamped; nothing to scroll at scale 1 for
    // a small media box, so the zoom path must be re-checked in hand mode).
    pz2.setMode("hand");
    stage.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, clientX: 300, clientY: 200 }));
    expect(pz2.totalScale).toBeGreaterThan(1);
  });

  it("select mode wheel pans overflowing media (scroll semantics)", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media, { mode: "select" });
    // 1000px-tall media in a small stage overflows vertically at scale 1 —
    // wheel-down scrolls the content up (negative ty), clamped at the edge.
    pz2.setMediaSize(400, 1000);
    stage.dispatchEvent(new WheelEvent("wheel", { deltaY: 3000, clientX: 300, clientY: 200 }));
    expect(pz2.totalScale).toBe(1);
    expect(media.style.transform).not.toContain("translate(0px, 0px)");
  });
});

/**
 * Pinch zoom (touch). happy-dom has no layout engine; the stage rect is
 * mocked by `mockStageRect` and `setPointerCapture` is stubbed.
 */
function touch(stage: HTMLElement, type: "down" | "move" | "up", id: number, x: number, y: number) {
  (stage as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  stage.dispatchEvent(
    new PointerEvent(`pointer${type}`, {
      pointerId: id,
      pointerType: "touch",
      button: 0,
      bubbles: true,
      clientX: x,
      clientY: y,
    }),
  );
}

describe("pinch zoom", () => {
  it("zooms on a two-finger pinch in select mode (pinch is mode-independent)", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media, { mode: "select" });
    pz2.setMediaSize(100, 80);
    touch(stage, "down", 1, 100, 200);
    touch(stage, "down", 2, 200, 200);
    // Finger distance 100 → 200 doubles the scale.
    touch(stage, "move", 2, 300, 200);
    expect(pz2.totalScale).toBeCloseTo(2, 5);
    touch(stage, "up", 1, 100, 200);
    touch(stage, "up", 2, 300, 200);
  });

  it("still never pans on a single-finger drag in select mode", () => {
    const stage = document.createElement("div");
    const media = document.createElement("div");
    stage.append(media);
    const pz2 = new PanZoom(stage, media, { mode: "select" });
    pz2.setMediaSize(1000, 800);
    pz2.setScale(1);
    touch(stage, "down", 1, 300, 200);
    touch(stage, "move", 1, 100, 100);
    touch(stage, "up", 1, 100, 100);
    expect(media.style.transform).toContain("translate(0px, 0px)");
  });
});
