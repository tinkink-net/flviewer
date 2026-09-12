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
export const textBlob = () => new Blob([new TextEncoder().encode("hello")], { type: "text/plain" });

export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
