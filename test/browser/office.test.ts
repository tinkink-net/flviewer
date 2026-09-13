import { describe, expect, it } from "vitest";
import { mount } from "../../src/index";
import { cfbBytes } from "../helpers";
import docxUrl from "../fixtures/minimal.docx?url";
import xlsxUrl from "../fixtures/multi-sheet.xlsx?url";
import pptxUrl from "../fixtures/minimal.pptx?url";

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

function readyOf(controller: ReturnType<typeof mount>): Promise<{ kind: string; pages?: number }> {
  return new Promise((resolve) => controller.on("ready", resolve as never));
}

describe("office family rendering (ADR-7)", () => {
  it("renders a DOCX with continuous pages (no pager)", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:600px;height:500px";
    document.body.append(container);
    const controller = mount(
      container,
      await blobFromUrl(
        docxUrl,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    );
    const ready = await readyOf(controller);
    expect(ready.kind).toBe("docx");
    expect(ready.pages).toBeUndefined();
    const doc = await waitUntil(() => container.querySelector<HTMLElement>(".flv-docx"));
    await waitUntil(() => (doc.textContent?.includes("Hello flviewer DOCX") ? true : null));
    // Pager stays hidden for the continuous-pages kind.
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!.hidden,
    ).toBe(true);
    controller.destroy();
    container.remove();
  }, 20000);

  it("renders an XLSX with a sheet dropdown riding the pager slot", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:600px;height:400px";
    document.body.append(container);
    const controller = mount(
      container,
      await blobFromUrl(
        xlsxUrl,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    );
    const ready = await readyOf(controller);
    expect(ready.kind).toBe("xlsx");
    expect(ready.pages).toBe(2);

    const select = await waitUntil(() =>
      container.querySelector<HTMLSelectElement>("select.flv-sheet-select"),
    );
    expect(select.options.length).toBe(2);
    expect(select.options[0]!.textContent).toBe("Alpha");
    expect(select.options[1]!.textContent).toBe("Beta Sheet");
    await waitUntil(
      () => container.querySelector(".flv-xlsx-table")?.textContent?.includes("Widget") ?? null,
    );

    // Toolbar transport: next arrow and the dropdown both switch sheets.
    const pagechange = new Promise<{ page: number; total: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click();
    expect((await pagechange).page).toBe(2);
    await waitUntil(
      () => container.querySelector(".flv-xlsx-table")?.textContent?.includes("Gadget") ?? null,
    );
    const change = new Promise<{ page: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    select.value = "0";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect((await change).page).toBe(1);
    // Zoom/mode machinery is hidden for the native-scroll kind.
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!.hidden).toBe(
      true,
    );
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="Hand mode"]')!.hidden,
    ).toBe(true);
    controller.destroy();
    container.remove();
  }, 20000);

  it("renders PPTX slides through the pager with pagechange", async () => {
    const container = document.createElement("div");
    container.style.cssText = "width:600px;height:400px";
    document.body.append(container);
    const controller = mount(
      container,
      await blobFromUrl(
        pptxUrl,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    );
    const ready = await readyOf(controller);
    expect(ready.kind).toBe("pptx");
    expect(ready.pages).toBe(2);

    const slide = await waitUntil(() => container.querySelector<HTMLElement>(".flv-pptx"));
    expect(slide.getBoundingClientRect().width).toBeGreaterThan(0);

    const pagechange = new Promise<{ page: number; total: number }>((resolve) =>
      controller.on("pagechange", resolve as never),
    );
    (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click();
    const detail = await pagechange;
    expect(detail.page).toBe(2);
    expect(detail.total).toBe(2);
    const indicator = await waitUntil(() =>
      container.querySelector(".flv-page-indicator")!.textContent === "2 / 2" ? true : null,
    );
    expect(indicator).toBe(true);
    controller.destroy();
    container.remove();
  }, 20000);

  it("reports encrypted-office as a typed detection error", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const encrypted = new File([cfbBytes(["EncryptionInfo", "EncryptedPackage"])], "secret.docx");
    const controller = mount(container, encrypted);
    const error = await new Promise<{ error: { code: string } }>((resolve) =>
      controller.on("error", resolve as never),
    );
    expect(error.error.code).toBe("encrypted-office");
    controller.destroy();
    container.remove();
  });

  it("reports legacy binary Office as unsupported with an explicit message", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const legacy = new File([cfbBytes(["WordDocument"])], "old.doc");
    const controller = mount(container, legacy);
    const error = await new Promise<{ error: { code: string; message: string } }>((resolve) =>
      controller.on("error", resolve as never),
    );
    expect(error.error.code).toBe("unsupported-type");
    expect(error.error.message).toContain("Legacy binary Office");
    controller.destroy();
    container.remove();
  });
});
