import { describe, expect, it } from "vitest";
import { detectKind } from "../src/detect";

const b = (...bytes: number[]) => new Uint8Array(bytes);
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("detectKind — MIME first", () => {
  it("claims application/pdf regardless of name/bytes", () => {
    expect(detectKind({ mime: "application/pdf", name: "x.bin", bytes: b(0) })).toBe("pdf");
  });

  it("claims image/* mime", () => {
    expect(detectKind({ mime: "image/webp", bytes: b(0) })).toBe("image");
  });

  it("ignores parameters in mime", () => {
    expect(detectKind({ mime: "IMAGE/PNG; charset=x", bytes: b(0) })).toBe("image");
  });
});

describe("detectKind — extension fallback", () => {
  it("generic mime + .pdf name → pdf", () => {
    expect(
      detectKind({
        mime: "application/octet-stream",
        name: "report.PDF",
        bytes: b(0, 1, 2),
      }),
    ).toBe("pdf");
  });

  it("strips query strings from URL names", () => {
    expect(
      detectKind({
        name: "https://x.test/a/b/photo.png?token=1",
        bytes: b(0),
      }),
    ).toBe("image");
  });

  it("known image extension → image", () => {
    expect(detectKind({ name: "a.JPEG", bytes: b(0) })).toBe("image");
    expect(detectKind({ name: "a.webp", bytes: b(0) })).toBe("image");
    expect(detectKind({ name: "a.avif", bytes: b(0) })).toBe("image");
  });
});

describe("detectKind — magic bytes", () => {
  it("pdf signature", () => {
    expect(detectKind({ bytes: ascii("%PDF-1.7 trailing") })).toBe("pdf");
  });

  it("png signature", () => {
    expect(detectKind({ bytes: b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a) })).toBe("image");
  });

  it("jpeg signature", () => {
    expect(detectKind({ bytes: b(0xff, 0xd8, 0xff, 0xe0) })).toBe("image");
  });

  it("gif signature", () => {
    expect(detectKind({ bytes: ascii("GIF89a") })).toBe("image");
  });

  it("webp signature (RIFF….WEBP)", () => {
    const bytes = Uint8Array.from(ascii("RIFF") && [0x52, 0x49, 0x46, 0x46]);
    const full = new Uint8Array(12);
    full.set(bytes, 0);
    full.set(ascii("WEBP"), 8);
    expect(detectKind({ bytes: full })).toBe("image");
  });

  it("avif ftyp brand", () => {
    const full = new Uint8Array(12);
    full.set(ascii("ftyp"), 4);
    full.set(ascii("avif"), 8);
    expect(detectKind({ bytes: full })).toBe("image");
  });

  it("bmp signature", () => {
    expect(detectKind({ bytes: ascii("BM\x00\x00") })).toBe("image");
  });

  it("ico signature", () => {
    expect(detectKind({ bytes: b(0, 0, 1, 0, 1, 0) })).toBe("image");
  });

  it("svg text", () => {
    expect(detectKind({ bytes: ascii('  <svg xmlns="…">') })).toBe("image");
    expect(detectKind({ bytes: ascii('<?xml version="1.0"?><svg/>') })).toBe("image");
  });

  it("unknown → unsupported", () => {
    expect(detectKind({ bytes: ascii("just some text") })).toBe("unsupported");
    expect(detectKind({ bytes: b(0, 0, 0, 0) })).toBe("unsupported");
  });
});
