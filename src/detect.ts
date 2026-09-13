import type { FlvTextKind } from "./types";

/**
 * Detection outcome. Office kinds are first-class (`docx`/`xlsx`/`pptx`);
 * `encrypted-office` is not a kind but a typed-error outcome resolved during
 * detection (ADR-7) — `loadSource` turns it into the typed error.
 */
export type DetectResult =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "text"
  | "docx"
  | "xlsx"
  | "pptx"
  | "encrypted-office"
  | "unsupported";

export interface DetectInput {
  /** MIME from Content-Type / blob.type, if any. */
  mime?: string | null;
  /** File.name or URL pathname, if any. */
  name?: string | null;
  /** Leading bytes of the payload (up to 64 KB). */
  bytes: Uint8Array;
  /**
   * Trailing bytes of the payload, when the full payload is in memory.
   * Required only to resolve bare `PK\x03\x04` containers by their central
   * directory (ADR-7); `fileOffset` is the absolute payload offset of the
   * slice's first byte (`payload.byteLength - bytes.byteLength`).
   */
  tail?: { bytes: Uint8Array; fileOffset: number };
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

/** Text family: MIME/extension → sub-kind (see CONTEXT.md "Sub-kind"). */
const TEXT_MIME_PREFIXES = new Set(["text/"]);

const CODE_EXTENSIONS = new Set([
  // JavaScript / TypeScript family
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  // Styles
  "css",
  "scss",
  "less",
  // Markup / templates
  "html",
  "htm",
  "vue",
  "svelte",
  // Configs
  "ini",
  "conf",
  "toml",
  "yml",
  "yaml",
  "properties",
  "env",
  // Shells
  "sh",
  "bash",
  "zsh",
  "fish",
  "bat",
  "cmd",
  "ps1",
  // Systems / compiled
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "hh",
  "cs",
  "java",
  "kt",
  "kts",
  "swift",
  "scala",
  "go",
  "rs",
  "dart",
  "php",
  "rb",
  "py",
  "pyw",
  "lua",
  "pl",
  "pm",
  "sql",
  "r",
  "graphql",
  "gql",
  "proto",
  "dockerfile",
  "mk",
  "make",
  "diff",
  "patch",
]);

const TEXT_EXTENSIONS: Record<string, FlvTextKind> = {
  txt: "plain",
  log: "plain",
  text: "plain",
  md: "markdown",
  markdown: "markdown",
  json: "json",
  jsonl: "json",
  csv: "csv",
  tsv: "csv",
  xml: "xml",
  xhtml: "xml",
  rss: "xml",
  atom: "xml",
  xsl: "xml",
  xslt: "xml",
  xsd: "xml",
  plist: "xml",
};

/** Code extensions resolve to a highlight language at render time. */
for (const ext of CODE_EXTENSIONS) {
  TEXT_EXTENSIONS[ext] = "code";
}

/**
 * Sub-kind refinement for the text family (see CONTEXT.md "Sub-kind"):
 * specific MIME → extension → generic `text/*`. Returns null when neither
 * claims a text sub-kind.
 */
export function textSubKindOf(input: {
  mime?: string | null;
  name?: string | null;
}): FlvTextKind | null {
  const mime = input.mime?.toLowerCase().split(";")[0]?.trim();
  const ext = extensionOf(input.name);
  const byExt = ext ? (TEXT_EXTENSIONS[ext] ?? null) : null;
  if (mime) {
    if (TEXT_MIME_PREFIXES.has(mime.slice(0, 5))) {
      if (mime === "text/markdown") {
        return "markdown";
      }
      if (mime === "text/csv" || mime === "text/tab-separated-values") {
        return "csv";
      }
      if (mime === "text/xml" || mime === "application/xhtml+xml" || mime.endsWith("+xml")) {
        return "xml";
      }
      if (mime === "text/html" || mime === "text/javascript" || mime === "text/css") {
        return "code";
      }
      // Generic text/* (text/plain and friends): the extension is more specific.
      return byExt ?? "plain";
    }
    if (mime === "application/json" || mime === "application/x-ndjson" || mime.endsWith("+json")) {
      return "json";
    }
    if (mime === "application/xml" || mime.endsWith("+xml")) {
      return "xml";
    }
    if (
      mime === "application/javascript" ||
      mime === "application/x-javascript" ||
      mime === "application/ecmascript"
    ) {
      return "code";
    }
  }
  return byExt;
}

/**
 * Text sniff: rejects NUL bytes and invalid UTF-8. `stream: true` keeps a
 * truncated multi-byte sequence at the head boundary from failing fatally.
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      return false;
    }
  }
  try {
    void new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}

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
  if (/^<svg[\s/>]/i.test(trimmed)) {
    return true;
  }
  // An XML declaration alone is not SVG — every XML document starts this
  // way. Require the <svg root element within the sniffed head.
  if (/^<\?xml/i.test(trimmed)) {
    return /<svg[\s/>]/i.test(trimmed);
  }
  return false;
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
 * Office family detection (ADR-7). Extension/MIME tables first, then the two
 * container sniffs. Container magic is authoritative over claims: OOXML
 * packages are never CFB, so a `D0 CF 11 E0` head under an OOXML name means
 * encryption or a renamed legacy binary.
 */
const OFFICE_MIME_TO_KIND: Record<string, DetectResult> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-word.document.macroenabled.12": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel.sheet.macroenabled.12": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": "pptx",
};

const OFFICE_EXTENSIONS: Record<string, DetectResult> = {
  docx: "docx",
  docm: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  pptx: "pptx",
  pptm: "pptx",
};

const LEGACY_OFFICE_EXTENSIONS = new Set(["doc", "xls", "ppt"]);

const LEGACY_OFFICE_MIMES = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

/** True when a payload resolved to `unsupported` is a legacy binary Office format. */
export function isLegacyOfficeFormat(input: {
  mime?: string | null;
  name?: string | null;
}): boolean {
  const mime = input.mime?.toLowerCase().split(";")[0]?.trim();
  if (mime && LEGACY_OFFICE_MIMES.has(mime)) {
    return true;
  }
  return LEGACY_OFFICE_EXTENSIONS.has(extensionOf(input.name));
}

function officeClaimOf(input: { mime?: string | null; name?: string | null }): DetectResult | null {
  const mime = input.mime?.toLowerCase().split(";")[0]?.trim();
  if (mime && OFFICE_MIME_TO_KIND[mime]) {
    return OFFICE_MIME_TO_KIND[mime];
  }
  const ext = extensionOf(input.name);
  return ext ? (OFFICE_EXTENSIONS[ext] ?? null) : null;
}

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isCfb(bytes: Uint8Array): boolean {
  return CFB_SIGNATURE.every((b, i) => bytes[i] === b);
}

const CFB_ENCRYPTED_NAMES = new Set(["encryptedpackage", "encryptioninfo"]);
const CFB_LEGACY_NAMES = new Set(["worddocument", "workbook", "book", "powerpoint document"]);

/**
 * Minimal CFB directory walk: header → DIFAT → FAT chain → directory chain,
 * collecting UTF-16LE entry names. Inconclusive (truncated head, malformed
 * structures) yields `null` — the caller falls back to claims.
 */
function cfbDirectoryNames(bytes: Uint8Array): string[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 512) {
    return null;
  }
  const sectorSize = 1 << view.getUint16(30, true);
  if (sectorSize !== 512 && sectorSize !== 4096) {
    return null;
  }
  const fatSectorCount = view.getUint32(44, true);
  let dirSector = view.getUint32(48, true);
  if (dirSector === 0xfffffffe || dirSector === 0xffffffff) {
    return null;
  }
  // FAT sectors from the header DIFAT (first 109 entries cover < 7 MB files —
  // directory chains of realistic documents resolve within the 64 KB head).
  const fat = new Map<number, number>();
  const difatEntries = Math.min(fatSectorCount, 109);
  for (let i = 0; i < difatEntries; i++) {
    const s = view.getUint32(76 + i * 4, true);
    if (s === 0xffffffff || s === 0xfffffffe) {
      continue;
    }
    const off = 512 + s * sectorSize;
    if (off + sectorSize > bytes.length) {
      break;
    }
    for (let e = 0; e + 4 <= sectorSize; e += 4) {
      fat.set((s * sectorSize) / 4 + e / 4, view.getUint32(off + e, true));
    }
  }
  const names: string[] = [];
  let guard = 0;
  const visited = new Set<number>();
  while (dirSector !== 0xfffffffe && dirSector !== 0xffffffff && guard < 1024) {
    if (visited.has(dirSector)) {
      break;
    }
    visited.add(dirSector);
    const off = 512 + dirSector * sectorSize;
    if (off + sectorSize > bytes.length) {
      return names.length > 0 ? names : null;
    }
    for (let e = 0; e + 128 <= sectorSize; e += 128) {
      const nameLen = view.getUint16(off + e + 64, true);
      if (nameLen < 2 || nameLen > 64) {
        continue;
      }
      const type = bytes[off + e + 66];
      if (type !== 2 && type !== 5 && type !== 1) {
        continue;
      }
      let name = "";
      for (let c = 0; c + 2 <= nameLen - 2 && c < 62; c += 2) {
        const code = view.getUint16(off + e + c, true);
        name += String.fromCharCode(code);
      }
      if (name) {
        names.push(name.toLowerCase());
      }
    }
    const next = fat.get(dirSector);
    if (next === undefined) {
      break;
    }
    dirSector = next;
    guard++;
  }
  return names;
}

function cfbOfficeOutcome(input: DetectInput): DetectResult | null {
  const names = cfbDirectoryNames(input.bytes);
  if (names) {
    if (names.some((n) => CFB_ENCRYPTED_NAMES.has(n))) {
      return "encrypted-office";
    }
    if (names.some((n) => CFB_LEGACY_NAMES.has(n))) {
      return "unsupported";
    }
  }
  // Inconclusive walk: an OOXML claim on a CFB payload means encryption
  // (OOXML packages are never CFB); a legacy claim means legacy binary.
  const claim = officeClaimOf(input);
  if (claim) {
    return "encrypted-office";
  }
  if (isLegacyOfficeFormat(input)) {
    return "unsupported";
  }
  return null;
}

/** ZIP local-file-header / central-directory / EOCD signatures. */
const ZIP_LOCAL_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function isZipContainer(bytes: Uint8Array): boolean {
  return ZIP_LOCAL_MAGIC.every((b, i) => bytes[i] === b);
}

function zipNameAt(view: DataView, base: number, length: number): string {
  let name = "";
  for (let i = 0; i < length; i++) {
    name += String.fromCharCode(view.getUint8(base + i));
  }
  return name;
}

/**
 * Sync central-directory scan of a tail slice: entry names are raw header
 * bytes, so the OOXML sub-kind resolves without any decompression or zip
 * dependency (ADR-7). Inconclusive → `null` (caller falls through).
 */
function zipSubKindFromTail(tail: Uint8Array, tailFileOffset: number): DetectResult | null {
  // Locate the EOCD record (22 bytes + trailing comment) backwards.
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const minEocd = 22;
  let eocd = -1;
  for (let i = tail.length - minEocd; i >= 0 && i >= tail.length - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    return null;
  }
  const entries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  let p = cdOffset - tailFileOffset;
  if (p < 0 || p >= tail.length) {
    return null; // Central directory starts before the slice — inconclusive.
  }
  const prefixes: [string, DetectResult][] = [
    ["word/", "docx"],
    ["xl/", "xlsx"],
    ["ppt/", "pptx"],
  ];
  for (let n = 0; n < entries && n < 4096; n++) {
    if (p + 46 > tail.length || view.getUint32(p, true) !== 0x02014b50) {
      return null;
    }
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (p + 46 + nameLen > tail.length) {
      return null;
    }
    const name = zipNameAt(view, p + 46, nameLen);
    for (const [prefix, kind] of prefixes) {
      if (name.startsWith(prefix)) {
        return kind;
      }
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/**
 * Office-family detection: CFB first (authoritative over claims — OOXML
 * packages are never CFB), then MIME claims (Content-Type is trusted like
 * `application/pdf`), then extension claims and the central-directory scan
 * on a ZIP container. `null` = not conclusively office — the chain continues.
 */
function officeKind(input: DetectInput): DetectResult | null {
  if (isCfb(input.bytes)) {
    return cfbOfficeOutcome(input);
  }
  const mime = input.mime?.toLowerCase().split(";")[0]?.trim();
  if (mime && OFFICE_MIME_TO_KIND[mime]) {
    return OFFICE_MIME_TO_KIND[mime];
  }
  if (isZipContainer(input.bytes)) {
    const ext = extensionOf(input.name);
    const extClaim = ext ? (OFFICE_EXTENSIONS[ext] ?? null) : null;
    if (extClaim) {
      return extClaim;
    }
    if (input.tail) {
      return zipSubKindFromTail(input.tail.bytes, input.tail.fileOffset);
    }
  }
  return null;
}

/**
 * Detection chain: known-good MIME → extension → office containers → text
 * sniff → magic bytes. Generic MIMEs (e.g. application/octet-stream) fall
 * through to extension. A text claim (MIME `text/*`, json/xml/javascript, or
 * a text-family extension) must pass the UTF-8/NUL sniff — mislabeled
 * binaries keep falling through to magic bytes. Office containers (ZIP/CFB,
 * ADR-7) resolve before the text sniff: they are binary by construction and
 * container magic outranks MIME/extension claims.
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
  const office = officeKind(input);
  if (office) {
    return office;
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
  if (textSubKindOf(input) !== null && looksLikeText(input.bytes)) {
    // The text sniff precedes magic bytes — but a known binary signature
    // (e.g. `%PDF-` served as text/plain) still wins over the text claim.
    const magic = magicKind(input.bytes);
    if (magic === "unsupported") {
      return "text";
    }
    return magic;
  }
  return magicKind(input.bytes);
}
