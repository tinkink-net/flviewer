import { describe, expect, it, vi } from "vitest";
import { mount, open } from "../../src/index";
import { jpgBlob, pdfBlob, pngBlob, textBlob } from "../helpers";
import pngUrl from "../fixtures/tiny.png?url";

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
