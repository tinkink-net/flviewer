export type DetectResult = "image" | "pdf" | "video" | "audio" | "unsupported";

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

export const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "webm", "mov", "ogv"]);

export const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac"]);

/** ISO-BMFF ftyp brands that mean "video container" (MP4/MOV/3GP family). */
const VIDEO_FTYP_BRANDS = new Set([
  "isom",
  "iso2",
  "mp41",
  "mp42",
  "mp71",
  "avc1",
  "iso5",
  "iso6",
  "dash",
  "MSNV",
  "mmp4",
  "F4V ",
  "f4v ",
  "M4V ",
  "m4v ",
  "qt  ",
]);

export function extensionOf(name: string | null | undefined): string {
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
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WAVE", 8)) {
    return "audio";
  }
  if (startsWith(bytes, "fLaC")) {
    return "audio";
  }
  if (startsWith(bytes, "OggS")) {
    // Ogg is ambiguous (.ogg audio vs .ogv video); named .ogv URLs/files are
    // caught by the extension step before magic runs. Default to audio.
    return "audio";
  }
  // EBML: WebM / Matroska.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video";
  }
  // AVIF/HEIF: ISO BMFF box with ftyp brand.
  if (startsWith(bytes, "ftyp", 4)) {
    const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
    if (brand.startsWith("avif") || brand.startsWith("avis")) {
      return "image";
    }
    if (brand.startsWith("M4A") || brand.startsWith("M4B")) {
      return "audio";
    }
    if (VIDEO_FTYP_BRANDS.has(brand)) {
      return "video";
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
  if (startsWith(bytes, "ID3")) {
    return "audio";
  }
  const b1 = bytes[1] ?? 0;
  const b2 = bytes[2] ?? 0;
  // ADTS AAC frame sync (MPEG-4 / MPEG-2).
  if (bytes[0] === 0xff && (b1 & 0xf6) === 0xf0) {
    return "audio";
  }
  // Raw MP3 frame sync (11 set bits + valid version/layer/bitrate fields).
  if (
    bytes[0] === 0xff &&
    (b1 & 0xe0) === 0xe0 &&
    (b1 & 0x18) !== 0x08 &&
    (b1 & 0x06) !== 0x00 &&
    (b2 & 0xf0) !== 0xf0
  ) {
    return "audio";
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
  if (mime?.startsWith("video/")) {
    return "video";
  }
  if (mime?.startsWith("audio/") || mime === "application/ogg") {
    return "audio";
  }
  const ext = extensionOf(input.name);
  if (ext === "pdf") {
    return "pdf";
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return "audio";
  }
  return magicKind(input.bytes);
}
