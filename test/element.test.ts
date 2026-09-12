import { describe, expect, it } from "vitest";
import { FlViewerElement, defineFlViewer } from "../src/element";
import { mount } from "../src/embed";
import { pngBlob } from "./helpers";

describe("<fl-viewer>", () => {
  it("is auto-registered", () => {
    defineFlViewer();
    expect(customElements.get("fl-viewer")).toBe(FlViewerElement);
  });

  it("renders via the source property and fires ready", async () => {
    const el = document.createElement("fl-viewer") as FlViewerElement;
    document.body.append(el);
    const seen = new Promise((resolve) => {
      el.addEventListener("flv:ready", (ev) => resolve((ev as CustomEvent).detail), {
        once: true,
      });
    });
    el.source = pngBlob();
    const detail = (await seen) as { kind: string };
    expect(detail.kind).toBe("image");
    expect(el.querySelector(".flv-root")).toBeTruthy();
    el.remove();
  });

  it("src attribute (URL) updates flow through", async () => {
    const el = document.createElement("fl-viewer") as FlViewerElement;
    document.body.append(el);
    el.src = "https://x.test/tiny.png";
    await new Promise((r) => setTimeout(r, 10));
    // Network fetch fails in happy-dom → typed error event, not an exception.
    const errored = new Promise((resolve) => {
      el.addEventListener("flv:error", resolve, { once: true });
    });
    await errored;
    el.remove();
  });

  it("on() delegates to the controller when mounted", async () => {
    const el = document.createElement("fl-viewer") as FlViewerElement;
    document.body.append(el);
    const seen = new Promise((resolve) => el.on("ready" as never, resolve as never));
    el.source = pngBlob();
    const detail = (await seen) as { kind: string };
    expect(detail.kind).toBe("image");
    el.remove();
  });

  it("destroying on disconnect cleans up the embed registry", async () => {
    const el = document.createElement("fl-viewer") as FlViewerElement;
    document.body.append(el);
    el.source = pngBlob();
    await new Promise((r) => setTimeout(r, 5));
    expect(el.querySelector(".flv-root")).toBeTruthy();
    el.remove();
    expect(el.querySelector(".flv-root")).toBeNull();
  });

  it("Embed mount still exists as the low-level API", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mount(container, pngBlob());
    expect(typeof controller.update).toBe("function");
    expect(typeof controller.destroy).toBe("function");
    expect(typeof controller.on).toBe("function");
    expect(typeof controller.close).toBe("function");
    controller.destroy();
  });
});
