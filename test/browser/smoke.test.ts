import { describe, expect, it, vi } from "vitest";
import { mount, open } from "../../src/index";
import { jpgBlob, pdfBlob, pngBlob, textBlob } from "../helpers";
import mp3Url from "../fixtures/tiny.mp3?url";
import mp4Url from "../fixtures/tiny.mp4?url";
import pngUrl from "../fixtures/tiny.png?url";
import webmUrl from "../fixtures/tiny.webm?url";

async function blobFromUrl(url: string, type: string): Promise<Blob> {
  const res = await fetch(url);
  return new Blob([await res.arrayBuffer()], { type });
}

async function waitUntil<T>(fn: () => T | undefined | null, timeout = 5000): Promise<T> {
  const start = performance.now();
  for (;;) {
    const value = fn();
    if (value !== undefined && value !== null) {
      return value;
    }
    if (performance.now() - start > timeout) {
      throw new Error("waitUntil timed out");
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("browser rendering", () => {
  it("decodes and fits a PNG blob", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, pngBlob());
    const img = await waitUntil(() => container.querySelector<HTMLImageElement>("img.flv-img"));
    await waitUntil(() => img.complete && img.naturalWidth === 32);
    await vi.waitFor(() => {
      // Fit applied: transform present.
      expect(img.style.transform).toContain("scale");
    });
    controller.destroy();
    img.remove();
    container.remove();
  });

  it("decodes a JPEG blob", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, jpgBlob());
    const img = await waitUntil(() => container.querySelector<HTMLImageElement>("img.flv-img"));
    await waitUntil(() => img.complete && img.naturalWidth === 64);
    controller.destroy();
    img.remove();
    container.remove();
  });

  it("renders both PDF pages with pdf.js and supports paging", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:500px";
    document.body.append(container);
    const controller = mount(container, pdfBlob());
    const ready = await new Promise<{ kind: string; pages?: number }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("pdf");
    expect(ready.pages).toBe(2);

    const canvas = await waitUntil(() =>
      container.querySelector<HTMLCanvasElement>("canvas.flv-canvas"),
    );
    // The page is painted: white background with dark text pixels.
    await waitUntil(() => {
      const ctx = canvas.getContext("2d")!;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] ?? 255) < 120) {
          dark++;
        }
      }
      return dark > 10 ? dark : null;
    });

    const pagechange = new Promise<{ page: number; total: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click();
    const detail = await pagechange;
    expect(detail.page).toBe(2);
    expect(detail.total).toBe(2);
    expect(container.querySelector(".flv-page-indicator")!.textContent).toBe("2 / 2");
    controller.destroy();
    container.remove();
  }, 20000);

  it("loads from a URL and reports progress events", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:300px;height:300px";
    document.body.append(container);
    const controller = mount(container, pngUrl);
    const ready = await new Promise<{ kind: string }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("image");
    controller.destroy();
    container.remove();
  });

  it("shows the typed error state for unsupported types", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, textBlob());
    const error = await new Promise<{ error: { code: string } }>((resolve) =>
      controller.on("error", resolve as never),
    );
    expect(error.error.code).toBe("unsupported-type");
    await waitUntil(() =>
      (container.querySelector(".flv-error") as HTMLElement).hidden === false ? true : null,
    );
    controller.destroy();
    container.remove();
  });

  it("hides hidden-attribute elements despite CSS display overrides", async () => {
    // Regression: author `.flv-error { display:grid }` used to beat the UA's
    // `[hidden]{display:none}`, leaving an empty floating Retry dialog on
    // every preview and pager arrows on image toolbars.
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, pngBlob());
    const ready = await new Promise<{ kind: string }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("image");
    await waitUntil(() =>
      container.querySelector<HTMLImageElement>("img.flv-img")?.complete === true ? true : null,
    );
    for (const label of ["Previous page", "Next page"]) {
      const btn = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
      expect(btn.hidden).toBe(true);
      // Actually collapsed, not just flagged.
      expect(btn.getBoundingClientRect().width).toBe(0);
    }
    expect(
      (container.querySelector(".flv-error") as HTMLElement).getBoundingClientRect().width,
    ).toBe(0);
    controller.destroy();
    container.remove();
  });

  it("fit and actual-size render distinct base sizes (container-independent 1:1)", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:500px";
    document.body.append(container);
    const controller = mount(container, pdfBlob());
    await new Promise((resolve) => controller.on("ready", resolve as never));
    const canvas = await waitUntil(() =>
      container.querySelector<HTMLCanvasElement>("canvas.flv-canvas"),
    );
    // 200x200 pt page in a 400x500 stage: fit = min(352/200, 452/200) = 1.76.
    await vi.waitFor(() => {
      expect(canvas.style.width).toBe("352px");
    });

    // 100% = base dimension (96 DPI CSS): 200 pt * 96/72 = 266.67 px,
    // independent of the container size. Re-renders are async (worker
    // roundtrip) and can be slow under parallel test load.
    (container.querySelector('button[aria-label="Actual size"]') as HTMLButtonElement).click();
    await vi.waitFor(
      () => {
        expect(Number.parseFloat(canvas.style.width)).toBeCloseTo(200 * (96 / 72), 1);
      },
      { timeout: 10000 },
    );
    expect(canvas.getBoundingClientRect().width).toBeCloseTo(200 * (96 / 72), 0);

    // Back to fit re-paints at the stage size.
    (container.querySelector('button[aria-label="Fit"]') as HTMLButtonElement).click();
    await vi.waitFor(
      () => {
        expect(canvas.style.width).toBe("352px");
      },
      { timeout: 10000 },
    );
    controller.destroy();
    container.remove();
  });

  it("centers media in the stage (PDF and image)", async () => {
    for (const blob of [pdfBlob(), pngBlob()]) {
      const container = document.createElement("div");
      container.style.cssText = "width:400px;height:300px";
      document.body.append(container);
      const controller = mount(container, blob);
      await new Promise((resolve) => controller.on("ready", resolve as never));
      const media = await waitUntil(() =>
        container.querySelector<HTMLCanvasElement | HTMLImageElement>(
          "canvas.flv-canvas, img.flv-img",
        ),
      );
      const stage = container.querySelector(".flv-stage")!;
      await vi.waitFor(() => {
        const m = media.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        // Fully rendered pages are fit-sized; small images are natural-sized.
        expect(m.width).toBeGreaterThan(0);
        const mc = { x: m.left + m.width / 2, y: m.top + m.height / 2 };
        const sc = { x: s.left + s.width / 2, y: s.top + s.height / 2 };
        expect(Math.abs(mc.x - sc.x)).toBeLessThan(2);
        expect(Math.abs(mc.y - sc.y)).toBeLessThan(2);
      });
      controller.destroy();
      container.remove();
    }
  });

  it("overlay: opens, closes via Esc, restores focus, unlocks scroll", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.append(trigger);
    trigger.focus();

    const controller = open(pdfBlob());
    const overlay = await waitUntil(() => document.querySelector(".flv-overlay"));
    expect(document.body.classList.contains("flv-lock")).toBe(true);
    await new Promise((resolve) => controller.on("ready", resolve as never));

    const closed = new Promise<{ by: string }>((resolve) =>
      controller.on("close", resolve as never),
    );
    // Core owns the Esc handler (on .flv-root, inside the overlay).
    const coreRoot = await waitUntil(() => overlay.querySelector<HTMLElement>(".flv-root"));
    coreRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const detail = await closed;
    expect(detail.by).toBe("user");
    expect(document.querySelector(".flv-overlay")).toBeNull();
    expect(document.body.classList.contains("flv-lock")).toBe(false);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("wheel zooms in overlay mode", async () => {
    const controller = open(pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve as never));
    const stage = await waitUntil(() => document.querySelector(".flv-stage"));
    const zoomed = new Promise<{ scale: number }>((resolve) =>
      controller.on("zoom", resolve as never),
    );
    stage.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, clientX: 100, clientY: 100 }));
    const detail = await zoomed;
    expect(detail.scale).toBeGreaterThan(1);
    controller.close();
  });
});

describe("browser media rendering (Phase 1)", () => {
  it("plays an MP4 with toolbar controls and two-level zoom", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, await blobFromUrl(mp4Url, "video/mp4"));
    const ready = await new Promise<{ kind: string }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("video");
    const video = await waitUntil(() =>
      container.querySelector<HTMLVideoElement>("video.flv-video"),
    );
    // Controls live in the toolbar, not on the element (ADR-5).
    expect(video.controls).toBe(false);
    await waitUntil(() => (video.readyState >= 1 && video.videoWidth === 64 ? true : null));
    await vi.waitFor(() => {
      expect(video.style.transform).toContain("scale");
    });

    // 100% = 1:1 native pixels; fit scales back up.
    (container.querySelector('button[aria-label="Actual size"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(video.style.transform).toContain("scale(1)");
    });
    (container.querySelector('button[aria-label="Fit"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(video.style.transform).not.toContain("scale(1)");
    });

    // Toolbar transport: play, then seek via the slider.
    const playBtn = container.querySelector('button[aria-label="Play"]') as HTMLButtonElement;
    playBtn.click();
    await waitUntil(() => (!video.paused && video.currentTime > 0 ? true : null));
    expect(playBtn.getAttribute("aria-label")).toBe("Pause");
    const seek = container.querySelector('input[aria-label="Seek"]') as HTMLInputElement;
    expect(seek.disabled).toBe(false);
    seek.value = "500";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    await waitUntil(() =>
      Math.abs(video.currentTime - (video.duration ?? 1) / 2) < 0.3 ? true : null,
    );
    controller.destroy();
    container.remove();
  });

  it("decodes a WebM blob", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, await blobFromUrl(webmUrl, "video/webm"));
    const ready = await new Promise<{ kind: string }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("video");
    const video = await waitUntil(() =>
      container.querySelector<HTMLVideoElement>("video.flv-video"),
    );
    await waitUntil(() => (video.readyState >= 1 && video.videoWidth === 64 ? true : null));
    controller.destroy();
    container.remove();
  });

  it("plays an MP3 with the toolbar as the player and a placeholder card", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, await blobFromUrl(mp3Url, "audio/mpeg"));
    const ready = await new Promise<{ kind: string }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("audio");
    const audio = await waitUntil(() =>
      container.querySelector<HTMLAudioElement>("audio.flv-audio"),
    );
    expect(audio.controls).toBe(false);
    expect(audio.hidden).toBe(true);
    const card = await waitUntil(() => container.querySelector(".flv-audio-card"));
    await waitUntil(() =>
      card.querySelector(".flv-audio-duration")!.textContent === "0:00" ? true : null,
    );
    const playBtn = container.querySelector('button[aria-label="Play"]') as HTMLButtonElement;
    playBtn.click();
    await waitUntil(() => (!audio.paused && audio.currentTime > 0 ? true : null));
    controller.destroy();
    container.remove();
  });

  it("plays a video straight from a URL source", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, mp4Url);
    const ready = await new Promise<{ kind: string }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("video");
    const video = await waitUntil(() =>
      container.querySelector<HTMLVideoElement>("video.flv-video"),
    );
    await waitUntil(() => (video.readyState >= 1 && video.videoWidth === 64 ? true : null));
    controller.destroy();
    container.remove();
  });

  it("reports a typed render-error for broken media payloads", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const broken = new File([new TextEncoder().encode("this is not a video")], "broken.mp4");
    const controller = mount(container, broken);
    const error = await new Promise<{ error: { code: string } }>((resolve) =>
      controller.on("error", resolve as never),
    );
    expect(error.error.code).toBe("render-error");
    await waitUntil(() =>
      (container.querySelector(".flv-error") as HTMLElement).hidden === false ? true : null,
    );
    controller.destroy();
    container.remove();
  });
});

describe("interaction modes (select/hand)", () => {
  function drag(stage: Element, from: [number, number], to: [number, number]): void {
    const opts = { pointerId: 1, pointerType: "mouse", button: 0, bubbles: true };
    stage.dispatchEvent(
      new PointerEvent("pointerdown", { ...opts, clientX: from[0], clientY: from[1] }),
    );
    stage.dispatchEvent(
      new PointerEvent("pointermove", { ...opts, clientX: to[0], clientY: to[1] }),
    );
    stage.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: to[0], clientY: to[1] }));
  }

  it("cannot drag media that fits the stage, pans when zoomed past it", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, jpgBlob());
    await new Promise((resolve) => controller.on("ready", resolve as never));
    const stage = await waitUntil(() => container.querySelector(".flv-stage"));
    const img = await waitUntil(() => container.querySelector<HTMLImageElement>("img.flv-img"));
    await waitUntil(() => (img.complete ? true : null));
    const stageRect = stage.getBoundingClientRect();
    const from: [number, number] = [
      stageRect.left + stageRect.width / 2,
      stageRect.top + stageRect.height / 2,
    ];
    // 64px image fit-upscaled to 252px still fits the 400x300 stage — immovable.
    await vi.waitFor(() => {
      expect(img.style.transform).toContain("scale");
    });
    drag(stage, from, [from[0] - 150, from[1] - 120]);
    expect(img.style.transform).toContain("translate(0px, 0px)");

    // Zoom past the stage (fit 3.94 → 4 clicks ≈ 9.61 → 615px): hand mode
    // pans, clamped at the edges (±107.6px horizontally, -140px vertically
    // for this drag is within the ±157.6px bound).
    for (let i = 0; i < 4; i++) {
      (container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click();
    }
    await vi.waitFor(() => {
      expect(img.style.transform).toMatch(/scale\(9\.6/);
    });
    drag(stage, from, [from[0] - 180, from[1] - 140]);
    await vi.waitFor(() => {
      expect(img.style.transform).toMatch(/translate\(-107\.6\d*px, -140px\)/);
    });
    controller.destroy();
    container.remove();
  });

  it("select mode freezes panning, hand mode resumes it", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mount(container, jpgBlob());
    await new Promise((resolve) => controller.on("ready", resolve as never));
    const stage = await waitUntil(() => container.querySelector(".flv-stage"));
    const img = await waitUntil(() => container.querySelector<HTMLImageElement>("img.flv-img"));
    await waitUntil(() => (img.complete ? true : null));
    const stageRect = stage.getBoundingClientRect();
    const center: [number, number] = [
      stageRect.left + stageRect.width / 2,
      stageRect.top + stageRect.height / 2,
    ];
    for (let i = 0; i < 4; i++) {
      (container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click();
    }
    await vi.waitFor(() => {
      expect(img.style.transform).toMatch(/scale\(9\.6/);
    });
    // Hand mode (default): drag to a panned, clamped position.
    drag(stage, center, [center[0] - 180, center[1] - 140]);
    await vi.waitFor(() => {
      expect(img.style.transform).toMatch(/translate\(-107\.6\d*px, -140px\)/);
    });

    (container.querySelector('button[aria-label="Select mode"]') as HTMLButtonElement).click();
    expect(stage.classList.contains("flv-mode-select")).toBe(true);
    const frozen = img.style.transform;
    drag(stage, center, [center[0] + 180, center[1] + 140]);
    expect(img.style.transform).toBe(frozen);

    (container.querySelector('button[aria-label="Hand mode"]') as HTMLButtonElement).click();
    drag(stage, center, [center[0] + 180, center[1] + 140]);
    // Deltas accumulate from the panned position: (-107.6, -140) + (180, 140)
    // = (72.4, 0) — within bounds, so no clamping on this drag.
    expect(img.style.transform).toMatch(/translate\(72\.3\d*px, 0px\)/);
    controller.destroy();
    container.remove();
  });

  it("keeps zoom across PDF page changes and re-centers pan", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:500px";
    document.body.append(container);
    const controller = mount(container, pdfBlob());
    await new Promise((resolve) => controller.on("ready", resolve as never));
    const canvas = await waitUntil(() =>
      container.querySelector<HTMLCanvasElement>("canvas.flv-canvas"),
    );
    // 200x200 pt page painted at the fit base (352px), panzoom scale 1.
    await vi.waitFor(() => {
      expect(canvas.style.width).toBe("352px");
    });
    for (let i = 0; i < 3; i++) {
      (container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click();
    }
    // 1.25^3 = 1.953 — arbitrary zoom now survives paging.
    await vi.waitFor(() => {
      expect(canvas.style.transform).toContain("scale(1.95");
    });

    const pagechange = new Promise<{ page: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click();
    await pagechange;
    await vi.waitFor(() => {
      expect(canvas.style.transform).toContain("scale(1.95");
      expect(canvas.style.transform).toContain("translate(0px, 0px)");
    });
    // "Fit" still repaints the fit base and resets the transform to 1×.
    (container.querySelector('button[aria-label="Fit"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(canvas.style.transform).toContain("scale(1)");
      expect(canvas.style.width).toBe("352px");
    });
    controller.destroy();
    container.remove();
  }, 20000);
});
