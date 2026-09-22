import { describe, expect, it } from "vitest";
import { mount } from "../../src/index";
import pngUrl from "../fixtures/tiny.png?url";
import { junkBlob } from "../helpers";

function textBlob(text: string, type: string, name?: string): Blob | File {
  const blob = new Blob([text], { type });
  return name ? new File([blob], name) : blob;
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

function controllerReady(controller: ReturnType<typeof mount>): Promise<{
  kind: string;
  textKind?: string;
}> {
  return new Promise((resolve) => controller.on("ready", resolve as never));
}

function mountText(container: HTMLElement, source: Blob | File | string, options?: object) {
  return mount(container, source as never, options as never);
}

describe("text views (Phase 2)", () => {
  it("renders plain text with native scroll and no transform toolbar", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mountText(container, textBlob("hello\nworld", "text/plain"));
    const ready = await controllerReady(controller);
    expect(ready.kind).toBe("text");
    expect(ready.textKind).toBe("plain");
    const pre = await waitPre(container);
    expect(pre.textContent).toBe("hello\nworld");
    // Native text selection: no user-select blocking on the stage content.
    expect(getComputedStyle(pre).userSelect).not.toBe("none");
    // Transform + mode groups hidden for text kinds.
    expect(hidden(container, "Zoom in")).toBe(true);
    expect(hidden(container, "Select mode")).toBe(true);
    expect(hidden(container, "Rotate")).toBe(true);
    expect(hidden(container, "Download")).toBe(false);
    controller.destroy();
    container.remove();
  });

  it("pretty-prints JSON and falls back to raw code when unparseable", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mountText(container, textBlob('{"a":1}', "application/json"));
    const ready = await controllerReady(controller);
    expect(ready.textKind).toBe("json");
    const pre = await waitPre(container);
    expect(pre.textContent).toBe('{\n  "a": 1\n}');

    const broken = document.createElement("div");
    document.body.append(broken);
    const controller2 = mountText(broken, textBlob('{"a":1,', "application/json"));
    await controllerReady(controller2);
    const pre2 = await waitPre(broken);
    expect(pre2.textContent).toBe('{"a":1,');
    controller.destroy();
    controller2.destroy();
    container.remove();
    broken.remove();
  });

  it("renders CSV as a table with a header row", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const controller = mountText(
      container,
      textBlob('name,note\n"Smith, John",ok\nAmy,too', "text/csv"),
    );
    const ready = await controllerReady(controller);
    expect(ready.textKind).toBe("csv");
    await waitUntil(() => container.querySelector(".flv-table"));
    const ths = [...container.querySelectorAll("th")].map((th) => th.textContent);
    expect(ths).toEqual(["name", "note"]);
    const tds = [...container.querySelectorAll("td")].map((td) => td.textContent);
    expect(tds).toEqual(["Smith, John", "ok", "Amy", "too"]);
    controller.destroy();
    container.remove();
  });

  it("highlights code and xml sub-kinds", async () => {
    for (const [payload, name, kind, cls] of [
      ["const x = 1;", "app.ts", "code", "language-typescript"],
      [
        '<?xml version="1.0" encoding="UTF-8"?>\n<root><a/></root>',
        "data.xml",
        "xml",
        "language-xml",
      ],
    ] as const) {
      const container = document.createElement("div");
      container.style.cssText = "width:400px;height:300px";
      document.body.append(container);
      const controller = mountText(container, textBlob(payload, "application/octet-stream", name));
      const ready = await controllerReady(controller);
      expect(ready.textKind).toBe(kind);
      const pre = await waitPre(container);
      expect(pre.querySelector("code")!.className).toContain(cls);
      expect(pre.querySelector(".hljs-keyword, .hljs-tag")).toBeTruthy();
      controller.destroy();
      container.remove();
    }
  });

  it("renders markdown as sanitized HTML and toggles to source", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const md = [
      "# Title",
      "",
      "[ext](https://example.test/x)",
      "",
      "<script>alert(1)</script>",
      "",
      "![broken](relative.png)",
    ].join("\n");
    const controller = mountText(container, textBlob(md, "text/markdown", "readme.md"));
    const ready = await controllerReady(controller);
    expect(ready.textKind).toBe("markdown");
    await waitUntil(() => container.querySelector(".flv-prose h1"));
    expect(container.querySelector(".flv-prose h1")!.textContent).toBe("Title");
    expect(container.querySelector("script")).toBeNull();
    const a = container.querySelector(".flv-prose a")!;
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    // Baseless relative asset → placeholder (no typed error).
    expect(container.querySelector(".flv-asset-missing")).toBeTruthy();

    // Source toggle: markdown-only, view-local, aria-pressed.
    const toggle = container.querySelector(
      'button[aria-label="Toggle source"]',
    ) as HTMLButtonElement;
    expect(toggle.hidden).toBe(false);
    toggle.click();
    await waitUntil(() => container.querySelector("pre.flv-code"));
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".flv-prose")).toBeNull();
    toggle.click();
    await waitUntil(() => container.querySelector(".flv-prose"));
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    controller.destroy();
    container.remove();

    // Non-markdown kinds never show the toggle.
    const plain = document.createElement("div");
    document.body.append(plain);
    const controller2 = mountText(plain, textBlob("hello", "text/plain"));
    await controllerReady(controller2);
    expect(hidden(plain, "Toggle source")).toBe(true);
    controller2.destroy();
    plain.remove();
  });

  it("renders markdown as a paper document on the dark chrome", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:640px;height:420px";
    document.body.append(container);
    const md = [
      "# Paper",
      "",
      "- bullet one",
      "- bullet two",
      "",
      "1. first",
      "2. second",
      "",
      "> quoted aside",
      "",
      "```ts",
      "const n: number = 1;",
      "```",
    ].join("\n");
    const controller = mountText(container, textBlob(md, "text/markdown", "doc.md"));
    await controllerReady(controller);
    const prose = await waitUntil(() => container.querySelector<HTMLElement>(".flv-prose"));

    // Paper card: white surface, shadow, dark prose — the PDF/Word metaphor.
    const card = getComputedStyle(prose);
    expect(card.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(card.boxShadow).not.toBe("none");
    expect(card.color).toBe("rgb(31, 41, 55)");

    // Lists keep their markers (host resets must not strip them).
    expect(getComputedStyle(prose.querySelector("ul")!).listStyleType).toBe("disc");
    expect(getComputedStyle(prose.querySelector("ol")!).listStyleType).toBe("decimal");

    // Fenced code sits on a light block with the light syntax palette.
    const pre = prose.querySelector("pre")!;
    expect(getComputedStyle(pre).backgroundColor).toBe("rgb(243, 244, 246)");
    expect(getComputedStyle(pre.querySelector(".hljs-keyword")!).color).toBe("rgb(215, 58, 73)");

    // The paper surface is themable through the namespaced custom property.
    const root = container.querySelector<HTMLElement>(".flv-root")!;
    root.style.setProperty("--flv-paper", "rgb(255, 251, 235)");
    expect(getComputedStyle(prose).backgroundColor).toBe("rgb(255, 251, 235)");

    // Source toggle stays the dark code surface — no paper card there.
    (container.querySelector('button[aria-label="Toggle source"]') as HTMLButtonElement).click();
    const code = await waitUntil(() => container.querySelector<HTMLPreElement>("pre.flv-code"));
    expect(container.querySelector(".flv-prose")).toBeNull();
    expect(getComputedStyle(code).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    controller.destroy();
    container.remove();
  });

  it("resolves markdown assets against baseUrl for in-memory sources", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const dir = pngUrl.replace(/[^/]*$/, "");
    const controller = mountText(container, textBlob("![t](tiny.png)", "text/markdown"), {
      baseUrl: new URL(dir, location.href).href,
    });
    await controllerReady(controller);
    const img = await waitUntil(() => container.querySelector<HTMLImageElement>(".flv-prose img"));
    await waitUntil(() => (img.complete && img.naturalWidth === 32 ? true : null));
    expect(img.getAttribute("loading")).toBe("lazy");
    controller.destroy();
    container.remove();
  });

  it("fires the truncated event with an in-view notice", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:400px;height:300px";
    document.body.append(container);
    const text = Array.from({ length: 10_005 }, (_, i) => `line-${i}`).join("\n");
    const controller = mountText(container, textBlob(text, "text/plain"));
    const truncated = await new Promise<{ bytes: number; lines: number }>((resolve) =>
      controller.on("truncated", resolve as never),
    );
    expect(truncated.lines).toBe(10_000);
    await waitUntil(() => container.querySelector(".flv-truncated"));
    expect(container.querySelector(".flv-truncated-text")!.textContent).toContain("lines");
    controller.destroy();
    container.remove();
  });

  it("unsupported binary payloads still surface the typed error", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = mountText(container, junkBlob());
    const error = await new Promise<{ error: { code: string } }>((resolve) =>
      controller.on("error", resolve as never),
    );
    expect(error.error.code).toBe("unsupported-type");
    controller.destroy();
    container.remove();
  });
});

function hidden(container: HTMLElement, label: string): boolean {
  const btn = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  // "until-found" counts as visible.
  return btn === null ? true : btn.hidden === true;
}

function waitPre(container: HTMLElement): Promise<HTMLPreElement> {
  return waitUntil(() => container.querySelector<HTMLPreElement>("pre"));
}
