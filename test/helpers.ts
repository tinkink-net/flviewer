import { TINY_JPG_B64, TINY_PNG_B64, TWO_PAGE_PDF_B64 } from "./fixtures/files";

function bytesOf(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export const pngBytes = () => bytesOf(TINY_PNG_B64);
export const jpgBytes = () => bytesOf(TINY_JPG_B64);
export const pdfBytes = () => bytesOf(TWO_PAGE_PDF_B64);

export const pngBlob = () => new Blob([pngBytes()], { type: "image/png" });
export const jpgBlob = () => new Blob([jpgBytes()], { type: "image/jpeg" });
export const pdfBlob = () => new Blob([pdfBytes()], { type: "application/pdf" });
/** Invalid UTF-8, no known magic → genuinely unsupported. */
export const junkBlob = () =>
  new Blob([new Uint8Array([0x80, 0x81, 0x82, 0x83])], { type: "application/octet-stream" });

/** Minimal valid mono 16-bit PCM WAV (sine at 440 Hz). */
export function wavBytes(durationSec = 0.05, sampleRate = 8000): Uint8Array<ArrayBuffer> {
  const samples = Math.floor(sampleRate * durationSec);
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples; i++) {
    view.setInt16(
      44 + i * 2,
      Math.round(Math.sin(((i / sampleRate) * 440 * 2 * Math.PI) as number) * 12000),
      true,
    );
  }
  return new Uint8Array(view.buffer);
}

export const wavBlob = () => new Blob([wavBytes()], { type: "audio/wav" });

/** First 16 bytes of an ISO-BMFF ftyp box with the given brand. */
export function ftypBytes(brand: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(16);
  bytes[3] = 0x10;
  bytes.set(
    Uint8Array.from("ftyp", (c) => c.charCodeAt(0)),
    4,
  );
  bytes.set(
    Uint8Array.from(brand.padEnd(4, " "), (c) => c.charCodeAt(0)),
    8,
  );
  return bytes;
}

// ── Office container builders (ADR-7 detection tests) ──────────────

const ZIP_CENTRAL_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;

/**
 * Minimal stored-entry ZIP: one local file header + payload per entry, then
 * central directory + EOCD — enough for the sync central-directory scan.
 */
export function zipBytes(entryNames: string[], payloadLen = 16): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const name of entryNames) {
    const nameBuf = nameBytes(name);
    const local = new Uint8Array(30 + nameBuf.length + payloadLen);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(26, nameBuf.length, true);
    local.set(nameBuf, 30);
    parts.push(local);
    const dir = new Uint8Array(46 + nameBuf.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, ZIP_CENTRAL_SIG, true);
    dv.setUint16(28, nameBuf.length, true);
    dv.setUint32(42, offset, true);
    dir.set(nameBuf, 46);
    central.push(dir);
    offset += local.length;
  }
  const centralBytes = concatBytes(central);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, ZIP_EOCD_SIG, true);
  ev.setUint16(8, entryNames.length, true);
  ev.setUint16(10, entryNames.length, true);
  ev.setUint32(12, centralBytes.length, true);
  ev.setUint32(16, offset, true);
  return concatBytes([...parts, centralBytes, eocd]);
}

function nameBytes(name: string): Uint8Array {
  return Uint8Array.from(name, (c) => c.charCodeAt(0));
}

function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const CFB_FREE = 0xffffffff;
const CFB_END = 0xfffffffe;
const CFB_FATSECT = 0xfffffffd;

/**
 * Minimal 512-byte-sector CFB: header, one FAT sector (sector 0), one
 * directory sector (sector 1) holding `Root Entry` + the given stream names.
 */
export function cfbBytes(streamNames: string[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(512 * 3);
  const view = new DataView(bytes.buffer);
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  signature.forEach((byte, i) => {
    bytes[i] = byte;
  });
  view.setUint16(26, 0x003e, true); // minor version
  view.setUint16(28, 0x0003, true); // major version
  view.setUint16(30, 0x0009, true); // sector shift → 512
  view.setUint16(32, 0x0006, true); // mini sector shift
  view.setUint32(44, 1, true); // FAT sector count
  view.setUint32(48, 1, true); // first directory sector
  view.setUint32(56, 4096, true); // mini stream cutoff
  view.setUint32(60, CFB_END, true); // first mini FAT sector
  view.setUint32(64, 0, true);
  view.setUint32(68, CFB_END, true); // first DIFAT sector
  view.setUint32(72, 0, true);
  view.setUint32(76, 0, true); // DIFAT[0] = sector 0 (the FAT)

  const fat = new DataView(bytes.buffer, 512, 512);
  fat.setUint32(0, CFB_FATSECT, true);
  fat.setUint32(4, CFB_END, true); // directory chain ends after sector 1
  for (let i = 2; i < 128; i++) {
    fat.setUint32(i * 4, CFB_FREE, true);
  }

  const entry = (index: number, name: string, type: number): void => {
    const base = 1024 + index * 128;
    for (let i = 0; i < name.length && i < 31; i++) {
      view.setUint16(base + i * 2, name.charCodeAt(i), true);
    }
    view.setUint16(base + 64, (name.length + 1) * 2, true);
    bytes[base + 66] = type;
  };
  entry(0, "Root Entry", 5);
  streamNames.forEach((name, i) => {
    entry(i + 1, name, 2);
  });
  return bytes;
}

/** Slice `bytes` into the DetectInput.tail shape (last `size` bytes). */
export function tailOf(bytes: Uint8Array, size = 512): { bytes: Uint8Array; fileOffset: number } {
  const fileOffset = Math.max(0, bytes.length - size);
  return { bytes: bytes.slice(fileOffset), fileOffset };
}

export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
