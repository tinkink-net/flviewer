/** Preview caps for text views (see CONTEXT.md "Truncation"). */
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_LINES = 10_000;

export interface TextPreview {
  /** Decoded (and possibly truncated) text. */
  text: string;
  /** Bytes kept, after caps. */
  keptBytes: number;
  /** Lines kept, after caps. */
  keptLines: number;
  /** Which cap fired, if any. */
  truncated: "bytes" | "lines" | null;
}

/**
 * Decode text with the preview caps: at most `MAX_BYTES` bytes and
 * `MAX_LINES` lines are kept; anything beyond is dropped (an event, never a
 * typed error). Invalid UTF-8 degrades to U+FFFD via the non-fatal decoder —
 * detection already rejected binaries.
 */
export function buildTextPreview(bytes: Uint8Array): TextPreview {
  let working = bytes;
  let truncated: TextPreview["truncated"] = null;
  if (bytes.byteLength > MAX_BYTES) {
    working = bytes.slice(0, MAX_BYTES);
    truncated = "bytes";
  }
  const text = new TextDecoder("utf-8").decode(working);
  let keptText = text;
  const lines = text.split("\n");
  if (lines.length > MAX_LINES) {
    keptText = lines.slice(0, MAX_LINES).join("\n");
    truncated = "lines";
  }
  return {
    text: keptText,
    keptBytes: new TextEncoder().encode(keptText).length,
    keptLines: keptText.split("\n").length,
    truncated,
  };
}

/** Pretty-print JSON when parseable; `null` means "render as code instead". */
export function tryPrettyJson(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "string" || typeof value === "number" || value === null) {
      return null;
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}
