import { describe, expect, it } from "vitest";
import { PdfBinaryDataFactory, loadPdfAssets } from "../src/pdf-assets";

describe("loadPdfAssets", () => {
  it("decodes the inlined archive and slices expected assets", async () => {
    const assets = await loadPdfAssets();
    expect(assets.size).toBeGreaterThanOrEqual(180);

    const cmap = assets.get("Adobe-GB1-0.bcmap");
    expect(cmap).toBeDefined();
    expect(cmap!.length).toBeGreaterThan(0);
    // Packed CMaps open with the Adobe bcmap marker + embedded license text.
    expect(cmap![0]).toBe(0x02);
    expect(cmap![1]).toBe(0xe0);

    for (const name of ["UniGB-UCS2-H.bcmap", "FoxitSerif.pfb", "jbig2.wasm", "openjpeg.wasm"]) {
      expect(assets.get(name)?.length).toBeGreaterThan(0);
    }
  });

  it("is cached across calls", async () => {
    expect(await loadPdfAssets()).toBe(await loadPdfAssets());
  });
});

describe("PdfBinaryDataFactory", () => {
  it("serves assets and hands out fresh copies each time", async () => {
    const factory = new PdfBinaryDataFactory({
      cMapUrl: null,
      standardFontDataUrl: null,
      wasmUrl: null,
    });
    const first = await factory.fetch({ kind: "cMapUrl", filename: "UniGB-UCS2-H.bcmap" });
    const second = await factory.fetch({ kind: "cMapUrl", filename: "UniGB-UCS2-H.bcmap" });
    expect([...first]).toEqual([...second]);
    // pdf.js transfers the buffer; each request must get an independent copy.
    expect(first.buffer).not.toBe(second.buffer);
    first[0] = 0xff;
    expect(second[0]).not.toBe(0xff);
  });

  it("serves every asset kind", async () => {
    const factory = new PdfBinaryDataFactory({});
    const font = await factory.fetch({
      kind: "standardFontDataUrl",
      filename: "LiberationSans-Regular.ttf",
    });
    const wasm = await factory.fetch({ kind: "wasmUrl", filename: "jbig2.wasm" });
    expect(font.length).toBeGreaterThan(0);
    // wasm magic: \0asm
    expect([...wasm.subarray(0, 4)]).toEqual([0, 0x61, 0x73, 0x6d]);
  });

  it("rejects unknown filenames", async () => {
    const factory = new PdfBinaryDataFactory({});
    await expect(factory.fetch({ kind: "cMapUrl", filename: "nope.bcmap" })).rejects.toThrow(
      /Unknown pdf\.js asset/,
    );
  });
});
