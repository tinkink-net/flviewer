import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../src/index";
import { pdfBlob } from "../helpers";
import pptxUrl from "../fixtures/minimal.pptx?url";

/** Force the coarse-pointer media query either way for a test. */
function mockCoarsePointer(coarse: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: coarse && query.includes("pointer: coarse"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

async function waitUntil<T>(fn: () => T | undefined | null, timeout = 10000): Promise<T> {
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

/** Single-finger horizontal drag with touch pointer events. */
function swipe(stage: Element, from: [number, number], to: [number, number]): void {
  const base = { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true };
  stage.dispatchEvent(
    new PointerEvent("pointerdown", { ...base, clientX: from[0], clientY: from[1] }),
  );
  stage.dispatchEvent(
    new PointerEvent("pointermove", {
      ...base,
      clientX: (from[0] + to[0]) / 2,
      clientY: (from[1] + to[1]) / 2,
    }),
  );
  stage.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: to[0], clientY: to[1] }));
  stage.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: to[0], clientY: to[1] }));
}

async function mountPdf(coarse: boolean): Promise<{
  container: HTMLElement;
  controller: ReturnType<typeof mount>;
}> {
  mockCoarsePointer(coarse);
  const container = document.createElement("div");
  container.style.cssText = "width:400px;height:500px";
  document.body.append(container);
  const controller = mount(container, pdfBlob());
  const ready = await new Promise<{ kind: string; pages?: number }>((resolve) =>
    controller.on("ready", resolve as never),
  );
  expect(ready.kind).toBe("pdf");
  expect(ready.pages).toBe(2);
  await waitUntil(() => container.querySelector("canvas.flv-canvas"));
  return { container, controller };
}

describe("touch gestures (coarse pointer)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the pager arrows and swipes between PDF pages", async () => {
    const { container, controller } = await mountPdf(true);
    const prev = container.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]')!;
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!;
    // Swipe replaces the arrows on touch…
    expect(prev.hidden).toBe(true);
    expect(next.hidden).toBe(true);
    // …but the indicator still says where you are.
    expect(container.querySelector(".flv-page-indicator")!.textContent).toBe("1 / 2");

    const stage = await waitUntil(() => container.querySelector(".flv-stage"));
    const rect = stage.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pagechange = new Promise<{ page: number; total: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    swipe(stage, [rect.left + rect.width - 40, midY], [rect.left + 40, midY]);
    const detail = await pagechange;
    expect(detail.page).toBe(2);
    expect(container.querySelector(".flv-page-indicator")!.textContent).toBe("2 / 2");

    // Swipe back → previous page.
    const back = new Promise<{ page: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    swipe(stage, [rect.left + 40, midY], [rect.left + rect.width - 40, midY]);
    expect((await back).page).toBe(1);

    controller.destroy();
    container.remove();
  }, 20000);

  it("keeps the pager arrows and ignores swipes on fine pointers", async () => {
    const { container, controller } = await mountPdf(false);
    const prev = container.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]')!;
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!;
    expect(prev.hidden).toBe(false);
    expect(next.hidden).toBe(false);

    const stage = await waitUntil(() => container.querySelector(".flv-stage"));
    const rect = stage.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    swipe(stage, [rect.left + rect.width - 40, midY], [rect.left + 40, midY]);
    await new Promise((r) => setTimeout(r, 50));
    // No page change: the gesture is touch-only.
    expect(container.querySelector(".flv-page-indicator")!.textContent).toBe("1 / 2");

    controller.destroy();
    container.remove();
  }, 20000);

  it("swipes between PPTX slides on touch", async () => {
    mockCoarsePointer(true);
    const container = document.createElement("div");
    container.style.cssText = "width:600px;height:400px";
    document.body.append(container);
    const res = await fetch(pptxUrl);
    const blob = new Blob([await res.arrayBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const controller = mount(container, blob);
    const ready = await new Promise<{ kind: string; pages?: number }>((resolve) =>
      controller.on("ready", resolve as never),
    );
    expect(ready.kind).toBe("pptx");
    expect(ready.pages).toBe(2);
    await waitUntil(() => container.querySelector(".flv-pptx"));

    const next = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!;
    expect(next.hidden).toBe(true);

    const stage = await waitUntil(() => container.querySelector(".flv-stage"));
    const rect = stage.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pagechange = new Promise<{ page: number; total: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    swipe(stage, [rect.left + rect.width - 40, midY], [rect.left + 40, midY]);
    expect((await pagechange).page).toBe(2);

    controller.destroy();
    container.remove();
  }, 20000);
});
