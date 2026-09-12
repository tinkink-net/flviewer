import { describe, expect, it } from "vitest";
import { mount, open } from "../src/index";
import { injectFlvStyles } from "../src/stylesheet";
import { flush, jpgBlob, pngBlob, textBlob } from "./helpers";

describe("mount (Embed)", () => {
  it("renders toolbar and fires ready for a PNG blob", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    const detail = (await new Promise((resolve) => controller.on("ready", resolve))) as {
      kind: string;
      name?: string;
    };
    expect(detail.kind).toBe("image");
    const root = container.querySelector(".flv-root")!;
    expect(root).toBeTruthy();
    expect(root.querySelector(".flv-toolbar")).toBeTruthy();
    expect(root.querySelector('button[aria-label="Zoom in"]')).toBeTruthy();
    // Pager is hidden for images.
    expect((root.querySelector('button[aria-label="Next page"]') as HTMLElement).hidden).toBe(true);
    // Close button is Overlay-only.
    expect((root.querySelector('button[aria-label="Close"]') as HTMLElement).hidden).toBe(true);
    controller.destroy();
  });

  it("injects the stylesheet exactly once", () => {
    injectFlvStyles();
    injectFlvStyles();
    expect(document.querySelectorAll("#flv-styles").length).toBe(1);
  });

  it("shows typed error state for unsupported types", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, textBlob());
    const error = (await new Promise((resolve) => controller.on("error", resolve))) as {
      error: { code: string };
    };
    expect(error.error.code).toBe("unsupported-type");
    const root = container.querySelector(".flv-root")!;
    expect((root.querySelector(".flv-error") as HTMLElement).hidden).toBe(false);
    expect(root.querySelector(".flv-retry")).toBeTruthy();
    controller.destroy();
  });

  it("update() swaps sources on the same instance", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const next = new Promise((resolve) => controller.on("ready", resolve));
    controller.update(jpgBlob());
    const detail = (await next) as { kind: string };
    expect(detail.kind).toBe("image");
    expect(container.querySelector("img.flv-img")).toBeTruthy();
    controller.destroy();
  });

  it("emits zoom events from toolbar buttons", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const zoomed = new Promise((resolve) => controller.on("zoom", resolve));
    (container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click();
    const detail = (await zoomed) as { scale: number };
    expect(detail.scale).toBeGreaterThan(1);
    controller.destroy();
  });

  it("destroy is idempotent and removes DOM", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    controller.destroy();
    controller.destroy();
    expect(container.children.length).toBe(0);
  });

  it("remounting the same container replaces the instance", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const first = mount(container, pngBlob());
    const second = mount(container, jpgBlob());
    await new Promise((resolve) => second.on("ready", resolve));
    expect(container.querySelectorAll(".flv-root").length).toBe(1);
    first.destroy();
    second.destroy();
  });

  it("close() is a no-op for Embed", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    await flush();
    controller.close();
    expect(container.querySelector(".flv-root")).toBeTruthy();
    controller.destroy();
  });

  it("dispatches bubbled flv:* CustomEvents", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    const seen = new Promise<CustomEvent>((resolve) => {
      container.addEventListener("flv:ready", (ev) => resolve(ev as CustomEvent), { once: true });
    });
    await seen;
    expect(seen).toBeTruthy();
    controller.destroy();
  });
});

describe("open (Overlay)", () => {
  it("creates a fullscreen overlay and locks scroll", async () => {
    const controller = (await import("../src/overlay")).open(pngBlob());
    const overlay = document.querySelector(".flv-overlay")!;
    expect(overlay).toBeTruthy();
    expect(document.body.classList.contains("flv-lock")).toBe(true);
    await new Promise((resolve) => controller.on("ready", resolve));
    controller.close();
  });

  it("close() removes overlay, unlocks scroll, emits close event", async () => {
    const controller = open(pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const closed = new Promise((resolve) => controller.on("close", resolve));
    controller.close();
    const detail = (await closed) as { by: string };
    expect(detail.by).toBe("api");
    expect(document.querySelector(".flv-overlay")).toBeNull();
    expect(document.body.classList.contains("flv-lock")).toBe(false);
  });

  it("a new open() replaces the current overlay", async () => {
    const first = open(pngBlob());
    await flush();
    const second = open(jpgBlob());
    await new Promise((resolve) => second.on("ready", resolve));
    expect(document.querySelectorAll(".flv-overlay").length).toBe(1);
    first.close();
    second.close();
  });

  it("Esc key closes the overlay with close event", async () => {
    const controller = open(pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const closed = new Promise((resolve) => controller.on("close", resolve));
    // Core owns the Esc handler (on .flv-root, inside the overlay).
    const coreRoot = document.querySelector(".flv-root") as HTMLElement;
    coreRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const detail = (await closed) as { by: string };
    expect(detail.by).toBe("user");
    expect(document.querySelector(".flv-overlay")).toBeNull();
  });
});
