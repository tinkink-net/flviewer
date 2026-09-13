import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv";
import { resolveReference } from "../src/asset-url";
import { MAX_BYTES, MAX_LINES, buildTextPreview, tryPrettyJson } from "../src/text-util";

describe("parseCsv (RFC-4180)", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted commas", () => {
    expect(parseCsv('name,age\n"Smith, John",42')).toEqual([
      ["name", "age"],
      ["Smith, John", "42"],
    ]);
  });

  it("handles quoted newlines", () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("handles escaped quotes and CRLF", () => {
    expect(parseCsv('"say ""hi""",y\r\nz,1\r\n')).toEqual([
      ['say "hi"', "y"],
      ["z", "1"],
    ]);
  });

  it("lone \\r is a record separator", () => {
    expect(parseCsv("a,b\rc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("trailing newline does not produce an empty row", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("empty fields and ragged rows are preserved", () => {
    expect(parseCsv("a,,c\n,x,")).toEqual([
      ["a", "", "c"],
      ["", "x", ""],
    ]);
  });

  it("custom delimiter (TSV)", () => {
    expect(parseCsv("a\tb\nc\td", "\t")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("empty input → no rows", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("buildTextPreview (truncation caps)", () => {
  it("passes small text through", () => {
    const preview = buildTextPreview(new TextEncoder().encode("hello\nworld"));
    expect(preview.text).toBe("hello\nworld");
    expect(preview.truncated).toBeNull();
    expect(preview.keptLines).toBe(2);
  });

  it("caps by bytes and reports kept amounts", () => {
    const bytes = new TextEncoder().encode("x".repeat(MAX_BYTES + 10));
    const preview = buildTextPreview(bytes);
    expect(preview.truncated).toBe("bytes");
    expect(preview.keptBytes).toBe(MAX_BYTES);
    expect(preview.keptLines).toBe(1);
  });

  it("caps by lines", () => {
    const text = Array.from({ length: MAX_LINES + 5 }, (_, i) => `line ${i}`).join("\n");
    const preview = buildTextPreview(new TextEncoder().encode(text));
    expect(preview.truncated).toBe("lines");
    expect(preview.keptLines).toBe(MAX_LINES);
    expect(preview.text.split("\n")).toHaveLength(MAX_LINES);
  });

  it("decodes multi-byte text intact", () => {
    const preview = buildTextPreview(new TextEncoder().encode("héllo 日"));
    expect(preview.text).toBe("héllo 日");
  });
});

describe("tryPrettyJson", () => {
  it("pretty-prints parseable JSON", () => {
    expect(tryPrettyJson('{"a":1,"b":[2,3]}')).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    );
    expect(tryPrettyJson("[1,2]")).toBe("[\n  1,\n  2\n]");
  });

  it("returns null for unparseable or scalar JSON", () => {
    expect(tryPrettyJson("{invalid")).toBeNull();
    expect(tryPrettyJson('{"a":1,')).toBeNull();
    expect(tryPrettyJson("42")).toBeNull();
    expect(tryPrettyJson('"just a string"')).toBeNull();
    expect(tryPrettyJson("null")).toBeNull();
  });
});

describe("resolveReference (ADR-6 policy)", () => {
  const policy = { sourceUrl: "https://docs.test/guide/readme.md" };

  it("absolute http(s) URLs pass as-is", () => {
    expect(resolveReference("https://cdn.test/img.png", policy)).toEqual({
      kind: "url",
      url: "https://cdn.test/img.png",
    });
  });

  it("relative references resolve against the source URL", () => {
    expect(resolveReference("img/a.png", policy)).toEqual({
      kind: "url",
      url: "https://docs.test/guide/img/a.png",
    });
    expect(resolveReference("../top.png", policy)).toEqual({
      kind: "url",
      url: "https://docs.test/top.png",
    });
  });

  it("baseUrl option beats the source URL", () => {
    expect(
      resolveReference("img/a.png", { ...policy, baseUrl: "https://base.test/assets/" }),
    ).toEqual({
      kind: "url",
      url: "https://base.test/assets/img/a.png",
    });
  });

  it("no base → missing (in-memory sources without baseUrl)", () => {
    expect(resolveReference("img/a.png", {})).toEqual({ kind: "missing" });
    expect(resolveReference("", policy)).toEqual({ kind: "missing" });
  });

  it("relative bases (page-relative source URLs) resolve against location", () => {
    expect(resolveReference("img/a.png", { sourceUrl: "/fixture.md" })).toEqual({
      kind: "url",
      url: new URL("/img/a.png", location.href).href,
    });
  });

  it("transform hook decides; null blocks to missing", () => {
    expect(
      resolveReference("a.png", { ...policy, transform: (u) => `https://signed.test/${u}?t=1` }),
    ).toEqual({ kind: "url", url: "https://signed.test/a.png?t=1" });
    expect(
      resolveReference("https://evil.test/a.png", { ...policy, transform: () => null }),
    ).toEqual({
      kind: "missing",
    });
  });

  it("fragments are recognized for links", () => {
    expect(resolveReference("#intro", policy)).toEqual({ kind: "fragment", id: "intro" });
  });

  it("disallowed schemes are missing", () => {
    expect(resolveReference("javascript:alert(1)", policy)).toEqual({ kind: "missing" });
    expect(resolveReference("file:///etc/passwd", policy)).toEqual({ kind: "missing" });
    expect(resolveReference("data:image/png;base64,AAAA", policy)).toEqual({
      kind: "url",
      url: "data:image/png;base64,AAAA",
    });
  });
});
