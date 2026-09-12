/**
 * In-memory delivery of pdf.js binary assets (Adobe CMaps, standard fonts,
 * jbig2/openjpeg wasm). The assets are inlined into the lazy chunk by
 * scripts/gen-pdf-assets.ts and served through a custom BinaryDataFactory,
 * so PDF rendering works with zero consumer configuration — no asset URLs,
 * no CORS, no extra files to host (see docs/adr/ADR-1-pdf-via-lazy-pdfjs.md).
 *
 * pdf.js requests assets from the worker via "FetchBinaryData" when
 * `useWorkerFetch` is false, and only ever calls `fetch({ kind, filename })`.
 */
/** Mirrors pdf.js's `BaseBinaryDataFactory#fetch` argument. */
export interface PdfAssetRequest {
  kind: "cMapUrl" | "standardFontDataUrl" | "wasmUrl";
  filename: string;
}

let loadPromise: Promise<Map<string, Uint8Array>> | null = null;

/** Decodes the inlined asset archive once and caches it. */
export function loadPdfAssets(): Promise<Map<string, Uint8Array>> {
  if (!loadPromise) {
    // Dynamic import keeps the ~3 MB asset archive in the PDF lazy chunk.
    loadPromise = import("./generated/pdf-assets").then(({ PDF_ASSETS_B64, PDF_ASSET_INDEX }) => {
      const raw = atob(PDF_ASSETS_B64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }
      const map = new Map<string, Uint8Array>();
      for (const [name, start, end] of PDF_ASSET_INDEX) {
        map.set(name, bytes.subarray(start, end));
      }
      return map;
    });
  }
  return loadPromise;
}

/**
 * Serves pdf.js's binary asset requests from memory. pdf.js instantiates
 * this class itself (passing the unused URL parameters), so the assets are
 * injected via `loadPdfAssets()` before `getDocument` is called.
 */
export class PdfBinaryDataFactory {
  constructor(_urls: {
    cMapUrl?: string | null;
    standardFontDataUrl?: string | null;
    wasmUrl?: string | null;
  }) {}

  async fetch({ filename }: PdfAssetRequest): Promise<Uint8Array> {
    const data = (await loadPdfAssets()).get(filename);
    if (!data) {
      throw new Error(`Unknown pdf.js asset: "${filename}"`);
    }
    // pdf.js transfers the buffer to the worker; hand out a fresh copy so
    // repeated requests (and multiple documents) see valid data.
    return data.slice();
  }
}
