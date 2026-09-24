import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../src/index";
import { createImageView } from "../../src/views";
import { pngBytes, pngBlob } from "../helpers";

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

interface MountedImage {
  container: HTMLElement;
  root: HTMLElement;
  stage: HTMLElement;
  img: HTMLImageElement;
  destroy: () => void;
}

/** Mount a PNG blob and wait for the image view to be interactive. */
async function mountImage(): Promise<MountedImage> {
  const container = document.createElement("div");
  container.style.cssText = "width:400px;height:300px";
  document.body.append(container);
  const controller = mount(container, pngBlob());
  await new Promise((resolve) => controller.on("ready", resolve));
  const img = await waitUntil(() => container.querySelector<HTMLImageElement>("img.flv-img"));
  await waitUntil(() => (img.complete && img.naturalWidth > 0 ? true : null));
  const root = container.querySelector<HTMLElement>(".flv-root")!;
  const stage = container.querySelector<HTMLElement>(".flv-stage")!;
  return {
    container,
    root,
    stage,
    img,
    destroy: () => {
      controller.destroy();
      container.remove();
    },
  };
}

const mounts: MountedImage[] = [];
async function mountTracked(): Promise<MountedImage> {
  const m = await mountImage();
  mounts.push(m);
  return m;
}

describe("image view native affordances (issue #15)", () => {
  afterEach(() => {
    while (mounts.length > 0) {
      mounts.pop()?.destroy();
    }
  });

  it("renders a real <img>, never a canvas", async () => {
    const { container, img } = await mountTracked();
    expect(img.matches("img.flv-img")).toBe(true);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("keeps the image selectable/callout-able in select mode, not in hand mode", async () => {
    const { img, root } = await mountTracked();
    // Default mode is select: the native long-press sheet must not be
    // suppressed (user-select: none kills the iOS callout).
    expect(getComputedStyle(img).userSelect).not.toBe("none");
    // Hand mode opts out again so drag-pans never start a selection.
    root.querySelector<HTMLButtonElement>('button[aria-label="Hand mode"]')!.click();
    expect(getComputedStyle(img).userSelect).toBe("none");
  });

  it("does not re-capture touch pointers away from the image", async () => {
    const { stage, root } = await mountTracked();
    const capture = vi.spyOn(stage, "setPointerCapture");

    stage.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        bubbles: true,
        clientX: 40,
        clientY: 40,
      }),
    );
    // Touch keeps its implicit capture on the <img> so the native long-press
    // context menu still targets the image.
    expect(capture).not.toHaveBeenCalled();

    // A mouse has no implicit capture — hand-mode drags still capture the
    // stage so a drag keeps tracking when the cursor leaves it.
    root.querySelector<HTMLButtonElement>('button[aria-label="Hand mode"]')!.click();
    stage.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 2,
        pointerType: "mouse",
        button: 0,
        bubbles: true,
        clientX: 40,
        clientY: 40,
      }),
    );
    expect(capture).toHaveBeenCalledTimes(1);
    capture.mockRestore();
  });

  it("downloads the original file bytes under the original name", async () => {
    const { root } = await mountTracked();
    root.querySelector<HTMLButtonElement>('button[aria-label="Download"]')!.click();

    // The download anchor is torn down on a grace timer so it can be
    // inspected while the (simulated) download is in flight.
    const anchor = await waitUntil(() =>
      document.querySelector<HTMLAnchorElement>("body > a[download]"),
    );
    expect(anchor.download).toBe("download.png");
    const bytes = new Uint8Array(await (await fetch(anchor.href)).arrayBuffer());
    // Byte-identical to the source file — no rendering, no viewer chrome.
    expect(bytes).toEqual(pngBytes());
  });
});

describe("image src selection (issue #15)", () => {
  const callbacks = {
    wheelMode: "always" as const,
    mode: "select" as const,
    onZoom: () => {},
    onError: () => {},
  };

  it("uses the original URL when the source has one", () => {
    const stage = document.createElement("div");
    document.body.append(stage);
    const view = createImageView(
      stage,
      { kind: "image", name: "x.png", url: "https://example.test/x.png", blob: pngBlob() } as never,
      callbacks,
    );
    const img = stage.querySelector<HTMLImageElement>("img.flv-img")!;
    // Original URL first — the only form WeChat's native menu can save, and
    // the cheapest form everywhere else.
    expect(img.getAttribute("src")).toBe("https://example.test/x.png");
    view.destroy();
    stage.remove();
  });

  it("falls back to a blob URL for in-memory sources in a normal browser", () => {
    const stage = document.createElement("div");
    document.body.append(stage);
    const view = createImageView(
      stage,
      { kind: "image", name: "x.png", blob: pngBlob() } as never,
      callbacks,
    );
    const img = stage.querySelector<HTMLImageElement>("img.flv-img")!;
    expect(img.src.startsWith("blob:")).toBe(true);
    view.destroy();
    stage.remove();
  });
});
