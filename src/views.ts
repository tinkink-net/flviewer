import { createFlvError, isPasswordException } from "./errors";
import { PanZoom } from "./panzoom";
import { PdfBinaryDataFactory } from "./pdf-assets";
import { createBlobWorker } from "./pdf-worker";
import type { LoadedSource } from "./source";
import type { FlvError } from "./types";

export interface ViewCallbacks {
  wheelMode: "always" | "ctrl";
  onZoom: (scale: number) => void;
  onError: (error: FlvError) => void;
  /** Fired when the visible PDF page changes (1-based). */
  onPageChange?: (page: number, total: number) => void;
  /** Fired once the view is interactive (first page painted for PDF). */
  onFirstRender?: () => void;
}

export interface FlvView {
  /** Whether the document has pages (PDF) — toggles the pager UI. */
  readonly hasPages: boolean;
  readonly pageCount?: number;
  zoomBy(factor: number): void;
  fit(): void;
  hundred(): void;
  rotate(): void;
  nextPage(): void;
  prevPage(): void;
  destroy(): void;
}

function stageFit(
  viewportW: number,
  viewportH: number,
  stage: HTMLElement,
  margin: number,
): number {
  const rect = stage.getBoundingClientRect();
  const availW = rect.width - margin * 2;
  const availH = rect.height - margin * 2;
  if (availW <= 0 || availH <= 0) {
    return 1;
  }
  // PDF pages may be upscaled to fit — no natural-size cap here.
  return Math.min(availW / viewportW, availH / viewportH);
}

const RENDER_MARGIN = 24;

export function createImageView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): FlvView {
  const objectUrl = URL.createObjectURL(loaded.blob);
  const img = document.createElement("img");
  img.className = "flv-media flv-img";
  img.alt = loaded.name ?? "Image preview";
  img.draggable = false;
  img.src = objectUrl;

  const panzoom = new PanZoom(stage, img, {
    wheelMode: cb.wheelMode,
    onZoom: cb.onZoom,
  });

  const onLoad = () => {
    if (img.naturalWidth > 0) {
      panzoom.setMediaSize(img.naturalWidth, img.naturalHeight);
      panzoom.fit();
    }
  };
  const onImgError = () => {
    cb.onError(createFlvError("render-error", "The image could not be decoded by the browser."));
  };
  img.addEventListener("load", onLoad);
  img.addEventListener("error", onImgError);
  stage.append(img);

  // Fire fit for the common case once layout settles (e.g. cached decode).
  queueMicrotask(() => {
    if (img.naturalWidth > 0) {
      onLoad();
    }
  });

  return {
    hasPages: false,
    zoomBy: (factor: number) => panzoom.zoomBy(factor),
    fit: () => panzoom.fit(),
    hundred: () => panzoom.setHundred(),
    rotate: () => panzoom.rotate90(),
    nextPage: () => {},
    prevPage: () => {},
    destroy: () => {
      panzoom.destroy();
      img.remove();
      URL.revokeObjectURL(objectUrl);
    },
  };
}

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    // Both the engine and the inlined worker source live in the lazy chunk.
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      import("./generated/pdf-worker-source"),
    ]).then(([pdfjs, workerSource]) => {
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        try {
          pdfjs.GlobalWorkerOptions.workerPort = createBlobWorker(workerSource.PDF_WORKER_SOURCE);
        } catch (err) {
          console.warn(
            "[flviewer] PDF worker unavailable; falling back to main-thread rendering.",
            err,
          );
        }
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export async function createPdfView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): Promise<FlvView> {
  let pdfjs: PdfjsModule;
  try {
    pdfjs = await loadPdfjs();
  } catch (err) {
    throw createFlvError("render-error", "The PDF engine could not be loaded.", err);
  }

  const canvas = document.createElement("canvas");
  canvas.className = "flv-media flv-canvas";
  stage.append(canvas);

  const panzoom = new PanZoom(stage, canvas, {
    wheelMode: cb.wheelMode,
    onZoom: cb.onZoom,
  });

  let doc: import("pdfjs-dist").PDFDocumentProxy | null = null;
  let currentTask: { cancel(): void; promise: Promise<void> } | null = null;
  let page = 1;
  let userRotation = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let firstRendered = false;

  // getDocument may transfer the buffer; always hand pdf.js a fresh copy.
  const data = new Uint8Array(await loaded.blob.arrayBuffer());

  try {
    doc = await pdfjs.getDocument({
      data,
      // Fetch CMaps / standard fonts / wasm from the main thread; the custom
      // factory below serves them from the inlined archive, so CJK-encoded
      // PDFs render with zero consumer configuration (see ADR-1).
      useWorkerFetch: false,
      cMapPacked: true,
      BinaryDataFactory: PdfBinaryDataFactory,
    }).promise;
  } catch (err) {
    if (isPasswordException(err)) {
      throw createFlvError("encrypted-pdf");
    }
    throw createFlvError("render-error", "The PDF could not be opened.", err);
  }

  const cancelCurrent = () => {
    currentTask?.cancel();
    currentTask = null;
  };

  async function renderPage(n: number): Promise<void> {
    if (!doc || doc.numPages === 0) {
      return;
    }
    const target = Math.min(Math.max(1, n), doc.numPages);
    const pdfPage = await doc.getPage(target);
    cancelCurrent();
    const base = pdfPage.getViewport({ scale: 1 });
    const rotation = (pdfPage.rotate + userRotation) % 360;
    const fit = stageFit(base.width, base.height, stage, RENDER_MARGIN);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = pdfPage.getViewport({ scale: fit * dpr, rotation });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const cssW = viewport.width / dpr;
    const cssH = viewport.height / dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    panzoom.setMediaSize(cssW, cssH);
    panzoom.fit();
    const context = canvas.getContext("2d");
    if (!context) {
      throw createFlvError("render-error", "Canvas 2D is unavailable.");
    }
    const task = pdfPage.render({ canvas, canvasContext: context, viewport });
    currentTask = task;
    try {
      await task.promise;
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { name?: string }).name === "RenderingCancelledException"
      ) {
        return;
      }
      throw err;
    }
    if (!firstRendered) {
      firstRendered = true;
      cb.onFirstRender?.();
    }
  }

  function scheduleRender(): void {
    void renderPage(page).catch((err) => {
      cb.onError(createFlvError("render-error", "The page could not be rendered.", err));
    });
  }

  await renderPage(page).catch((err) => {
    throw createFlvError("render-error", "The first page could not be rendered.", err);
  });

  resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(scheduleRender, 200);
  });
  resizeObserver.observe(stage);

  return {
    get hasPages() {
      return true;
    },
    pageCount: doc.numPages,
    zoomBy: (factor: number) => panzoom.zoomBy(factor),
    fit: () => panzoom.fit(),
    hundred: () => panzoom.setHundred(),
    rotate: () => {
      userRotation = (userRotation + 90) % 360;
      scheduleRender();
    },
    nextPage: () => {
      if (page < (doc?.numPages ?? 1)) {
        page += 1;
        scheduleRender();
        cb.onPageChange?.(page, doc?.numPages ?? 1);
      }
    },
    prevPage: () => {
      if (page > 1) {
        page -= 1;
        scheduleRender();
        cb.onPageChange?.(page, doc?.numPages ?? 1);
      }
    },
    destroy: () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeObserver?.disconnect();
      cancelCurrent();
      void doc?.destroy().catch(() => {});
      panzoom.destroy();
      canvas.remove();
      doc = null;
    },
  };
}
