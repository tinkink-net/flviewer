import { describe, expect, it } from "vitest";
import { detectKind, looksLikeText, textSubKindOf } from "../src/detect";
import { cfbBytes, ftypBytes, tailOf, zipBytes } from "./helpers";

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

  it("claims video/* mime", () => {
    expect(detectKind({ mime: "video/mp4", bytes: b(0) })).toBe("video");
    expect(detectKind({ mime: "video/webm", bytes: b(0) })).toBe("video");
    expect(detectKind({ mime: "video/quicktime", bytes: b(0) })).toBe("video");
  });

  it("claims audio/* and application/ogg mimes", () => {
    expect(detectKind({ mime: "audio/mpeg", bytes: b(0) })).toBe("audio");
    expect(detectKind({ mime: "audio/mp4", bytes: b(0) })).toBe("audio");
    expect(detectKind({ mime: "application/ogg", bytes: b(0) })).toBe("audio");
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

  it("known video extension → video", () => {
    expect(detectKind({ name: "a.mp4", bytes: b(0) })).toBe("video");
    expect(detectKind({ name: "a.m4v", bytes: b(0) })).toBe("video");
    expect(detectKind({ name: "a.webm", bytes: b(0) })).toBe("video");
    expect(detectKind({ name: "a.mov", bytes: b(0) })).toBe("video");
    expect(detectKind({ name: "a.ogv", bytes: b(0) })).toBe("video");
  });

  it("known audio extension → audio", () => {
    expect(detectKind({ name: "a.mp3", bytes: b(0) })).toBe("audio");
    expect(detectKind({ name: "a.wav", bytes: b(0) })).toBe("audio");
    expect(detectKind({ name: "a.ogg", bytes: b(0) })).toBe("audio");
    expect(detectKind({ name: "a.opus", bytes: b(0) })).toBe("audio");
    expect(detectKind({ name: "a.m4a", bytes: b(0) })).toBe("audio");
    expect(detectKind({ name: "a.aac", bytes: b(0) })).toBe("audio");
    expect(detectKind({ name: "a.flac", bytes: b(0) })).toBe("audio");
  });

  it("video extension wins over ambiguous Ogg magic", () => {
    expect(detectKind({ name: "a.ogv", bytes: ascii("OggS") })).toBe("video");
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
    // A plain XML declaration is not SVG — generic XML documents start this
    // way (regression: they must resolve to the text family, not image).
    const xml = ascii('<?xml version="1.0" encoding="UTF-8"?>\n<catalog>');
    expect(detectKind({ mime: "application/xml", bytes: xml })).toBe("text");
    expect(detectKind({ name: "a.xml", bytes: xml })).toBe("text");
    expect(detectKind({ bytes: xml })).toBe("unsupported");
  });

  it("mp4/mov ftyp brands → video", () => {
    expect(detectKind({ bytes: ftypBytes("isom") })).toBe("video");
    expect(detectKind({ bytes: ftypBytes("mp42") })).toBe("video");
    expect(detectKind({ bytes: ftypBytes("qt  ") })).toBe("video");
    expect(detectKind({ bytes: ftypBytes("M4V ") })).toBe("video");
  });

  it("m4a ftyp brand → audio", () => {
    expect(detectKind({ bytes: ftypBytes("M4A ") })).toBe("audio");
  });

  it("heic ftyp brand stays unsupported until Phase 7", () => {
    expect(detectKind({ bytes: ftypBytes("heic") })).toBe("unsupported");
  });

  it("webm EBML signature → video", () => {
    expect(detectKind({ bytes: b(0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82) })).toBe("video");
  });

  it("wav signature (RIFF….WAVE) → audio", () => {
    const full = new Uint8Array(12);
    full.set(ascii("RIFF"), 0);
    full.set(ascii("WAVE"), 8);
    expect(detectKind({ bytes: full })).toBe("audio");
  });

  it("ogg and flac signatures → audio", () => {
    expect(detectKind({ bytes: ascii("OggS\x00\x02") })).toBe("audio");
    expect(detectKind({ bytes: ascii("fLaC\x00\x00") })).toBe("audio");
  });

  it("mp3 signatures → audio", () => {
    expect(detectKind({ bytes: ascii("ID3\x03\x00\x00") })).toBe("audio");
    // Raw MPEG frame sync: FF FB 90 44.
    expect(detectKind({ bytes: b(0xff, 0xfb, 0x90, 0x44) })).toBe("audio");
    // ADTS AAC sync: FF F1.
    expect(detectKind({ bytes: b(0xff, 0xf1, 0x50, 0x80) })).toBe("audio");
  });

  it("mp3 sync does not swallow other FF-prefixed formats", () => {
    expect(detectKind({ bytes: b(0xff, 0xd8, 0xff, 0xe0) })).toBe("image");
    expect(detectKind({ bytes: b(0xff, 0xd8, 0xff) })).toBe("image");
  });

  it("unknown → unsupported", () => {
    expect(detectKind({ bytes: ascii("just some text") })).toBe("unsupported");
    expect(detectKind({ bytes: b(0, 0, 0, 0) })).toBe("unsupported");
  });
});

describe("detectKind — text family (Phase 2)", () => {
  it("claims text/* mimes", () => {
    expect(detectKind({ mime: "text/plain", bytes: ascii("hello") })).toBe("text");
    expect(detectKind({ mime: "text/markdown; charset=utf-8", bytes: ascii("# hi") })).toBe("text");
    expect(detectKind({ mime: "text/csv", bytes: ascii("a,b") })).toBe("text");
  });

  it("claims json/xml/javascript mimes", () => {
    expect(detectKind({ mime: "application/json", bytes: ascii("{}") })).toBe("text");
    expect(detectKind({ mime: "application/ld+json", bytes: ascii("{}") })).toBe("text");
    expect(detectKind({ mime: "application/xml", bytes: ascii("<a/>") })).toBe("text");
    expect(detectKind({ mime: "application/javascript", bytes: ascii("let x") })).toBe("text");
    expect(detectKind({ mime: "application/xhtml+xml", bytes: ascii("<html/>") })).toBe("text");
  });

  it("claims text-family extensions", () => {
    expect(detectKind({ name: "readme.md", bytes: ascii("#") })).toBe("text");
    expect(detectKind({ name: "data.csv", bytes: ascii("a") })).toBe("text");
    expect(detectKind({ name: "data.tsv", bytes: ascii("a") })).toBe("text");
    expect(detectKind({ name: "index.ts", bytes: ascii("const x = 1;") })).toBe("text");
    expect(detectKind({ name: "a.json", bytes: ascii("[1]") })).toBe("text");
    expect(detectKind({ name: "a.xml", bytes: ascii("<a/>") })).toBe("text");
    expect(detectKind({ name: "a.txt", bytes: ascii("hello") })).toBe("text");
    expect(detectKind({ name: "a.xhtml", bytes: ascii("<html/>") })).toBe("text");
  });

  it("claims code extensions (ts, py, go, sh, yml…)", () => {
    for (const ext of [
      "ts",
      "tsx",
      "py",
      "go",
      "rs",
      "java",
      "c",
      "sh",
      "yml",
      "yaml",
      "toml",
      "css",
      "html",
    ]) {
      expect(detectKind({ name: `a.${ext}`, bytes: ascii("x") })).toBe("text");
    }
  });

  it("binary-rejection: NUL or invalid UTF-8 falls through to magic", () => {
    expect(detectKind({ mime: "text/plain", bytes: ascii("a\x00b") })).toBe("unsupported");
    expect(detectKind({ mime: "text/plain", bytes: b(0x80, 0x81, 0x82) })).toBe("unsupported");
    expect(detectKind({ name: "a.md", bytes: b(0xc3, 0x28) })).toBe("unsupported");
    // Invalid UTF-8 that IS a media signature still resolves via magic.
    expect(detectKind({ mime: "text/plain", bytes: b(0xff, 0xfb, 0x90, 0x44) })).toBe("audio");
    expect(detectKind({ mime: "text/plain", bytes: ascii("%PDF-1.4") })).toBe("pdf");
  });

  it("bare ASCII without mime/extension stays unsupported", () => {
    expect(detectKind({ bytes: ascii("just some text") })).toBe("unsupported");
  });

  it("a multi-byte char split at the head boundary still passes", () => {
    const build = (tail: number[]): Uint8Array => {
      const bytes = new Uint8Array(64);
      bytes.set(Uint8Array.from(ascii("a".repeat(62))), 0);
      bytes.set(Uint8Array.from(tail), 64 - tail.length);
      return bytes;
    };
    // Complete 3-byte char ending at the boundary.
    expect(looksLikeText(build([0xe6, 0x97, 0xa5]))).toBe(true); // 日
    // Truncated multi-byte sequence at the boundary — stream mode keeps it.
    expect(looksLikeText(build([0xe6, 0x97]))).toBe(true);
    // Genuinely invalid continuation is rejected.
    expect(looksLikeText(build([0xe6, 0x28]))).toBe(false);
  });
});

describe("textSubKindOf", () => {
  it("refines by MIME", () => {
    expect(textSubKindOf({ mime: "text/markdown" })).toBe("markdown");
    expect(textSubKindOf({ mime: "text/csv" })).toBe("csv");
    expect(textSubKindOf({ mime: "text/tab-separated-values" })).toBe("csv");
    expect(textSubKindOf({ mime: "text/html" })).toBe("code");
    expect(textSubKindOf({ mime: "text/css" })).toBe("code");
    expect(textSubKindOf({ mime: "application/json" })).toBe("json");
    expect(textSubKindOf({ mime: "application/xml" })).toBe("xml");
    expect(textSubKindOf({ mime: "application/javascript" })).toBe("code");
    expect(textSubKindOf({ mime: "text/plain" })).toBe("plain");
    expect(textSubKindOf({ mime: "text/rtf" })).toBe("plain");
  });

  it("refines by extension when the MIME is generic", () => {
    expect(textSubKindOf({ mime: "application/octet-stream", name: "a.md" })).toBe("markdown");
    expect(textSubKindOf({ mime: "application/octet-stream", name: "a.ts" })).toBe("code");
    expect(textSubKindOf({ mime: "application/octet-stream", name: "a.tsv" })).toBe("csv");
    expect(textSubKindOf({ mime: "application/octet-stream", name: "a.json" })).toBe("json");
    expect(textSubKindOf({ mime: "application/octet-stream", name: "a.plist" })).toBe("xml");
    expect(textSubKindOf({ mime: "application/octet-stream", name: "a.txt" })).toBe("plain");
  });

  it("extension beats generic text/* mime", () => {
    expect(textSubKindOf({ mime: "text/plain", name: "a.md" })).toBe("markdown");
    expect(textSubKindOf({ mime: "text/plain", name: "a.json" })).toBe("json");
  });

  it("returns null when nothing claims text", () => {
    expect(textSubKindOf({ mime: "application/octet-stream", name: "a.xyz" })).toBeNull();
    expect(textSubKindOf({})).toBeNull();
  });
});

describe("detectKind — office family (ADR-7)", () => {
  it("claims OOXML mimes, including macro-enabled variants", () => {
    expect(
      detectKind({
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: b(0),
      }),
    ).toBe("docx");
    expect(
      detectKind({
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: b(0),
      }),
    ).toBe("xlsx");
    expect(
      detectKind({
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        bytes: b(0),
      }),
    ).toBe("pptx");
    expect(
      detectKind({
        mime: "application/vnd.ms-excel.sheet.macroenabled.12",
        bytes: b(0),
      }),
    ).toBe("xlsx");
  });

  it("claims OOXML extensions on generic mime", () => {
    const zip = zipBytes(["[Content_Types].xml", "word/document.xml"]);
    const tail = tailOf(zip);
    expect(detectKind({ mime: "application/octet-stream", name: "a.DOCX", bytes: zip, tail })).toBe(
      "docx",
    );
    expect(detectKind({ name: "a.xlsm", bytes: zip, tail })).toBe("xlsx");
    expect(detectKind({ name: "a.pptm", bytes: zip, tail })).toBe("pptx");
  });

  it("claims require the container: a PDF renamed .docx stays pdf", () => {
    expect(detectKind({ name: "report.docx", bytes: ascii("%PDF-1.4") })).toBe("pdf");
    expect(detectKind({ name: "report.docx", bytes: ascii("junk!") })).toBe("unsupported");
  });

  it("bare PK containers resolve via the central-directory scan", () => {
    const word = zipBytes(["[Content_Types].xml", "word/document.xml"]);
    const xl = zipBytes(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    const ppt = zipBytes(["ppt/presentation.xml", "ppt/slides/slide1.xml"]);
    expect(detectKind({ bytes: word, tail: tailOf(word) })).toBe("docx");
    expect(detectKind({ bytes: xl, tail: tailOf(xl) })).toBe("xlsx");
    expect(detectKind({ bytes: ppt, tail: tailOf(ppt) })).toBe("pptx");
  });

  it("scan is inconclusive without a tail slice → unsupported", () => {
    const word = zipBytes(["word/document.xml"]);
    expect(detectKind({ bytes: word })).toBe("unsupported");
  });

  it("non-office zip containers stay unsupported (Phase 5)", () => {
    const zip = zipBytes(["readme.txt", "data/data.bin"]);
    expect(detectKind({ bytes: zip, tail: tailOf(zip) })).toBe("unsupported");
  });

  it("CFB legacy binaries → unsupported, regardless of naming", () => {
    for (const names of [["WordDocument"], ["Workbook"], ["PowerPoint Document"], ["Book"]]) {
      const bytes = cfbBytes(names);
      expect(detectKind({ bytes, tail: tailOf(bytes) })).toBe("unsupported");
    }
    // A legacy file renamed to an OOXML extension resolves by content.
    const doc = cfbBytes(["WordDocument"]);
    expect(detectKind({ mime: null, name: "report.docx", bytes: doc, tail: tailOf(doc) })).toBe(
      "unsupported",
    );
  });

  it("CFB encrypted OOXML → encrypted-office, even under an OOXML name", () => {
    const encrypted = cfbBytes(["EncryptionInfo", "EncryptedPackage"]);
    expect(detectKind({ bytes: encrypted, tail: tailOf(encrypted) })).toBe("encrypted-office");
    expect(detectKind({ name: "secret.xlsx", bytes: encrypted, tail: tailOf(encrypted) })).toBe(
      "encrypted-office",
    );
  });

  it("CFB with an OOXML claim but an unreadable directory → encrypted-office", () => {
    // Truncated CFB: signature present, walk cannot resolve — the claim tips it.
    const bytes = cfbBytes([]).slice(0, 400);
    expect(detectKind({ name: "a.docx", bytes })).toBe("encrypted-office");
  });

  it("legacy extensions without CFB magic fall through (content wins)", () => {
    // A PDF named .doc stays a PDF.
    expect(detectKind({ name: "doc.doc", bytes: ascii("%PDF-1.4") })).toBe("pdf");
    // RTF masquerading as .doc has no text claim and no magic — pre-existing
    // chain semantics apply (extension-less text is unsupported), not a
    // legacy-office error.
    const rtf = ascii("{\\rtf1\\ansi hello}");
    expect(detectKind({ name: "resume.doc", bytes: rtf })).toBe("unsupported");
  });
});
