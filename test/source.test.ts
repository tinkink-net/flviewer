import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSource, suggestFilename } from "../src/source";
import { createFlvError, FlvAbortError } from "../src/errors";
import { jpgBytes, pdfBytes, pngBytes, textBlob } from "./helpers";

describe("loadSource — URL path", () => {
  beforeEach(() => {
    const bytes = pngBytes();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, {
            status: 200,
            headers: { "content-type": "image/png", "content-length": String(bytes.byteLength) },
          }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and detects from Content-Type + URL name", async () => {
    const loaded = await loadSource("https://x.test/pix/tiny.png");
    expect(loaded.kind).toBe("image");
    expect(loaded.name).toBe("tiny.png");
    expect(loaded.blob.type).toBe("image/png");
    expect(loaded.blob.size).toBe(pngBytes().byteLength);
  });

  it("reports streaming progress", async () => {
    const seen: Array<[number, number | null]> = [];
    await loadSource("https://x.test/pix/tiny.png", {
      onProgress: (loaded, total) => seen.push([loaded, total]),
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]?.[1]).toBe(pngBytes().byteLength);
  });

  it("honours requestInit headers", async () => {
    const spy = vi.fn(async () => new Response(pngBytes()));
    vi.stubGlobal("fetch", spy);
    await loadSource("https://x.test/doc.pdf", {
      requestInit: { headers: { Authorization: "Bearer t" }, credentials: "include" },
    });
    expect(spy).toHaveBeenCalledWith(
      "https://x.test/doc.pdf",
      expect.objectContaining({
        headers: { Authorization: "Bearer t" },
        credentials: "include",
      }),
    );
  });

  it("maps HTTP failure to fetch-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(loadSource("https://x.test/x.png")).rejects.toMatchObject({
      code: "fetch-error",
    });
  });

  it("maps network failure to fetch-error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );
    await expect(loadSource("https://x.test/x.png")).rejects.toMatchObject({
      code: "fetch-error",
    });
  });

  it("aborted signal → aborted error", async () => {
    const controller = new AbortController();
    controller.abort();
    // Aborts surface as the internal abort sentinel; the Core translates
    // them to silent superseded loads, never a typed error event.
    await expect(
      loadSource("https://x.test/x.png", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(FlvAbortError);
  });
});

describe("loadSource — in-memory sources", () => {
  it("Blob with mime", async () => {
    const loaded = await loadSource(new Blob([pdfBytes()], { type: "application/pdf" }));
    expect(loaded.kind).toBe("pdf");
  });

  it("File uses name", async () => {
    const file = new File([jpgBytes()], "pic.jpg", { type: "image/jpeg" });
    const loaded = await loadSource(file);
    expect(loaded.kind).toBe("image");
    expect(loaded.name).toBe("pic.jpg");
  });

  it("ArrayBuffer sniffed by magic bytes", async () => {
    const loaded = await loadSource(pdfBytes().slice().buffer);
    expect(loaded.kind).toBe("pdf");
  });

  it("Uint8Array sniffed by magic bytes", async () => {
    const loaded = await loadSource(pngBytes());
    expect(loaded.kind).toBe("image");
  });

  it("unsupported type → typed error", async () => {
    await expect(loadSource(textBlob())).rejects.toMatchObject({
      code: "unsupported-type",
    });
  });
});

describe("suggestFilename", () => {
  it("keeps an existing extension", () => {
    expect(
      suggestFilename({
        blob: new Blob([pngBytes()], { type: "image/png" }),
        kind: "image",
        name: "a.png",
      }),
    ).toBe("a.png");
  });

  it("appends extension from kind+mime", () => {
    expect(
      suggestFilename({
        blob: new Blob([pngBytes()], { type: "image/png" }),
        kind: "image",
        name: "noext",
      }),
    ).toBe("noext.png");
    expect(
      suggestFilename({ blob: new Blob([pdfBytes()], { type: "application/pdf" }), kind: "pdf" }),
    ).toBe("download.pdf");
  });

  it("falls back to download.ext", () => {
    expect(suggestFilename({ blob: new Blob([], { type: "image/jpeg" }), kind: "image" })).toBe(
      "download.jpg",
    );
  });
});

describe("createFlvError", () => {
  it("fills defaults and cause", () => {
    const err = createFlvError("encrypted-pdf", undefined, new Error("x"));
    expect(err.code).toBe("encrypted-pdf");
    expect(err.message).toBeTruthy();
    expect(err.cause).toBeInstanceOf(Error);
  });
});
