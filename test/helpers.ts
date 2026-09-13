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

export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
