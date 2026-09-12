export type DetectResult = "image" | "pdf" | "unsupported";

export interface DetectInput {
  /** MIME from Content-Type / blob.type, if any. */
  mime?: string | null;
  /** File.name or URL pathname, if any. */
  name?: string | null;
  /** Leading bytes of the payload. */
  bytes: Uint8Array;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "svg",
]);

function extensionOf(name: string | null | undefined): string {
  if (!name) {
    return "";
  }
  const base = name.split(/[?#]/)[0]?.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) {
    return "";
  }
  return base.slice(dot + 1).toLowerCase();
}

function startsWith(bytes: Uint8Array, ascii: string, offset = 0): boolean {
  if (bytes.length < offset + ascii.length) {
    return false;
  }
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 64));
  const trimmed = text.replace(/^\s+/, "");
  return /^<\?xml/i.test(trimmed) || /^<svg[\s>]/i.test(trimmed);
}

function magicKind(bytes: Uint8Array): DetectResult {
  if (startsWith(bytes, "%PDF-")) {
    return "pdf";
  }
  if (startsWith(bytes, "\x89PNG")) {
    return "image";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image";
  }
  if (startsWith(bytes, "GIF8")) {
    return "image";
  }
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WEBP", 8)) {
    return "image";
  }
  // AVIF/HEIF: ISO BMFF box with ftyp brand.
  if (startsWith(bytes, "ftyp", 4)) {
    const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
    if (brand.startsWith("avif") || brand.startsWith("avis")) {
      return "image";
    }
  }
  if (startsWith(bytes, "BM")) {
    return "image";
  }
  // ICO: reserved 0, reserved 0, type 1.
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return "image";
  }
  if (looksLikeSvg(bytes)) {
    return "image";
  }
  return "unsupported";
}

/**
 * Detection chain: known-good MIME → extension → magic bytes.
 * Generic MIMEs (e.g. application/octet-stream) fall through to extension.
 */
export function detectKind(input: DetectInput): DetectResult {
  const mime = input.mime?.toLowerCase().split(";")[0]?.trim();
  if (mime === "application/pdf" || mime === "application/x-pdf") {
    return "pdf";
  }
  if (mime?.startsWith("image/")) {
    return "image";
  }
  const ext = extensionOf(input.name);
  if (ext === "pdf") {
    return "pdf";
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  return magicKind(input.bytes);
}
