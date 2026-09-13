import { describe, expect, it } from "vitest";
import { mount, open } from "../src/index";
import { injectFlvStyles } from "../src/stylesheet";
import { flush, jpgBlob, pngBlob, textBlob, wavBlob, wavBytes } from "./helpers";

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

describe("media views (video/audio)", () => {
  it("renders an audio blob with toolbar media controls and a placeholder card", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, wavBlob());
    const detail = (await new Promise((resolve) => controller.on("ready", resolve))) as {
      kind: string;
    };
    expect(detail.kind).toBe("audio");
    const root = container.querySelector(".flv-root")!;
    const audio = root.querySelector("audio.flv-audio") as HTMLAudioElement;
    expect(audio).toBeTruthy();
    // Controls live in the toolbar (ADR-5), the element stays invisible.
    expect(audio.controls).toBe(false);
    expect(audio.hidden).toBe(true);
    expect(root.querySelector(".flv-audio-card")).toBeTruthy();
    expect(root.querySelector(".flv-audio-name")!.textContent).toBe("Audio");
    // Toolbar: media group visible, transforms and pager hidden.
    expect(root.querySelector('button[aria-label="Play"]')).toBeTruthy();
    expect(root.querySelector('input[aria-label="Seek"]')).toBeTruthy();
    expect(root.querySelector('input[aria-label="Volume"]')).toBeTruthy();
    expect((root.querySelector('button[aria-label="Zoom in"]') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('button[aria-label="Rotate"]') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('button[aria-label="Next page"]') as HTMLElement).hidden).toBe(true);
    controller.destroy();
  });

  it("routes video kinds to a video element with fit/100% but no rotate", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const file = new File([wavBytes()], "clip.mp4", { type: "" });
    const controller = mount(container, file);
    const detail = (await new Promise((resolve) => controller.on("ready", resolve))) as {
      kind: string;
    };
    expect(detail.kind).toBe("video");
    const root = container.querySelector(".flv-root")!;
    const video = root.querySelector("video.flv-video") as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.controls).toBe(false);
    expect((root.querySelector('button[aria-label="Play"]') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('button[aria-label="Fit"]') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('button[aria-label="Actual size"]') as HTMLElement).hidden).toBe(
      false,
    );
    expect((root.querySelector('button[aria-label="Zoom in"]') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('button[aria-label="Rotate"]') as HTMLElement).hidden).toBe(true);
    controller.destroy();
  });

  it("toggles playback from the toolbar play button", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, wavBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const playBtn = container.querySelector('button[aria-label="Play"]') as HTMLButtonElement;
    playBtn.click();
    const audio = container.querySelector("audio.flv-audio") as HTMLAudioElement;
    expect(audio.paused).toBe(false);
    expect(playBtn.getAttribute("aria-label")).toBe("Pause");
    playBtn.click();
    expect(audio.paused).toBe(true);
    expect(playBtn.getAttribute("aria-label")).toBe("Play");
    controller.destroy();
  });

  it("space toggles playback, arrows seek and mute key silences", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, wavBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const root = container.querySelector(".flv-root") as HTMLElement;
    const audio = container.querySelector("audio.flv-audio") as HTMLAudioElement;
    const key = (key: string) =>
      root.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    key(" ");
    expect(audio.paused).toBe(false);
    key(" ");
    expect(audio.paused).toBe(true);
    key("M");
    expect(audio.muted).toBe(true);
    controller.destroy();
  });

  it("surfaces media element failures as a typed render-error", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, wavBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const errored = new Promise((resolve) => controller.on("error", resolve));
    (container.querySelector("audio.flv-audio") as HTMLAudioElement).dispatchEvent(
      new Event("error"),
    );
    const detail = (await errored) as { error: { code: string; message: string } };
    expect(detail.error.code).toBe("render-error");
    expect((container.querySelector(".flv-error") as HTMLElement).hidden).toBe(false);
    controller.destroy();
  });

  it("emits zoom events for the two-level video zoom", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const file = new File([wavBytes()], "clip.mp4", { type: "" });
    const controller = mount(container, file);
    await new Promise((resolve) => controller.on("ready", resolve));
    const zoomed = new Promise((resolve) => controller.on("zoom", resolve));
    (container.querySelector('button[aria-label="Actual size"]') as HTMLButtonElement).click();
    const detail = (await zoomed) as { scale: number };
    expect(detail.scale).toBe(1);
    controller.destroy();
  });

  it("update() swaps an image for a video on the same instance", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const next = new Promise((resolve) => controller.on("ready", resolve));
    controller.update(wavBlob());
    const detail = (await next) as { kind: string };
    expect(detail.kind).toBe("audio");
    expect(container.querySelector("img.flv-img")).toBeNull();
    expect(container.querySelector("audio.flv-audio")).toBeTruthy();
    controller.destroy();
  });
});

describe("interaction modes", () => {
  it("shows select/hand toggle for images, pressed on hand by default", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const root = container.querySelector(".flv-root")!;
    const selectBtn = root.querySelector('button[aria-label="Select mode"]') as HTMLButtonElement;
    const handBtn = root.querySelector('button[aria-label="Hand mode"]') as HTMLButtonElement;
    expect(selectBtn).toBeTruthy();
    expect(handBtn.getAttribute("aria-pressed")).toBe("true");
    // Toggle via toolbar...
    selectBtn.click();
    expect(selectBtn.getAttribute("aria-pressed")).toBe("true");
    expect(handBtn.getAttribute("aria-pressed")).toBe("false");
    const stage = root.querySelector(".flv-stage")!;
    expect(stage.classList.contains("flv-mode-select")).toBe(true);
    // ...and via keyboard.
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
    expect(stage.classList.contains("flv-mode-hand")).toBe(true);
    controller.destroy();
  });

  it("keeps the mode when the source changes and hides it for audio", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    (container.querySelector('button[aria-label="Select mode"]') as HTMLButtonElement).click();
    controller.update(wavBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const root = container.querySelector(".flv-root")!;
    expect((root.querySelector('button[aria-label="Select mode"]') as HTMLElement).hidden).toBe(
      true,
    );
    expect((root.querySelector('button[aria-label="Hand mode"]') as HTMLElement).hidden).toBe(true);
    // Back to an image: the select mode persisted through the audio source.
    controller.update(jpgBlob());
    await new Promise((resolve) => controller.on("ready", resolve));
    const stage = container.querySelector(".flv-stage")!;
    expect(stage.classList.contains("flv-mode-select")).toBe(true);
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
