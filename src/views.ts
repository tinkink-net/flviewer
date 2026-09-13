import { createFlvError, isPasswordException } from "./errors";
import { ICONS } from "./icons";
import { PanZoom } from "./panzoom";
import { PdfBinaryDataFactory } from "./pdf-assets";
import { createBlobWorker } from "./pdf-worker";
import type { LoadedSource } from "./source";
import type { FlvError } from "./types";

/** Toolbar-side playback controls the Core owns; media views wire into them. */
export interface MediaControlsHost {
  connect(el: HTMLMediaElement): void;
}

export interface ViewCallbacks {
  wheelMode: "always" | "ctrl";
  onZoom: (scale: number) => void;
  onError: (error: FlvError) => void;
  /** Fired when the visible PDF page changes (1-based). */
  onPageChange?: (page: number, total: number) => void;
  /** Fired once the view is interactive (first page painted for PDF). */
  onFirstRender?: () => void;
  /** Toggle viewer fullscreen (video double-click). */
  onFullscreenToggle?: () => void;
  /** Present for media views: bind the element to the toolbar media controls. */
  mediaControls?: MediaControlsHost;
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

/** CSS px per PDF unit (pt): 72 dpi PDF geometry at the 96 dpi CSS base. */
const CSS_PER_PT = 96 / 72;

function stageFit(
  viewportW: number,
  viewportH: number,
  stage: HTMLElement,
  margin: number,
  rotation = 0,
): number {
  const rect = stage.getBoundingClientRect();
  const availW = rect.width - margin * 2;
  const availH = rect.height - margin * 2;
  if (availW <= 0 || availH <= 0) {
    return 1;
  }
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotW = viewportW * cos + viewportH * sin;
  const rotH = viewportW * sin + viewportH * cos;
  // PDF pages may be upscaled to fit — no natural-size cap here.
  return Math.min(availW / rotW, availH / rotH);
}

const RENDER_MARGIN = 24;

export function createImageView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): FlvView {
  if (!loaded.blob) {
    // Unreachable via the detection chain (only media kinds stream), but
    // guarded so the view contract stays total.
    throw createFlvError("render-error", "The image payload is missing.");
  }
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

/**
 * Media time formatter shared with the Core toolbar (m:ss, or h:mm:ss).
 */
export function formatMediaTime(sec: number): string {
  if (!Number.isFinite(sec)) {
    return "–:––";
  }
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * `<video>`/`<audio>` view (Phase 1). Created synchronously like the image
 * view — `ready` fires once the element is mounted; decode failures surface
 * later through the media element's `error` event as a typed `render-error`
 * (never an exception across the API boundary, ADR-4).
 *
 * Playback controls live in the Core toolbar (ADR-5): the element is mounted
 * with `controls = false` and wired to the toolbar via
 * `cb.mediaControls.connect()`. Video zoom is two-level only (fit / 100%);
 * audio gets a placeholder card and no transform at all.
 */
export function createMediaView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): FlvView {
  const isVideo = loaded.kind === "video";
  const el = document.createElement(isVideo ? "video" : "audio");
  el.className = isVideo ? "flv-media flv-video" : "flv-media flv-audio";
  el.preload = "metadata";
  el.controls = false;
  if (isVideo) {
    el.setAttribute("playsinline", "");
  }
  if (loaded.name) {
    el.setAttribute("aria-label", loaded.name);
  }

  let objectUrl: string | null = null;
  if (loaded.blob) {
    objectUrl = URL.createObjectURL(loaded.blob);
    el.src = objectUrl;
  } else if (loaded.url) {
    // Streaming source: hand the URL to the media element so the browser can
    // use Range-request seeking instead of a full download.
    el.src = loaded.url;
  }

  // Video transforms: two-level zoom (fit / 100%) applied programmatically —
  // no wheel/pinch/drag, so nothing user-facing scales the element (the
  // native-controls blow-up bug class). Pan for oversized 100% arrives with
  // the interaction-modes pass.
  const panzoom = isVideo
    ? new PanZoom(stage, el, {
        wheelMode: cb.wheelMode,
        onZoom: cb.onZoom,
        interactive: false,
      })
    : null;

  const applyMeta = () => {
    if (!isVideo || !panzoom) {
      return;
    }
    const video = el as HTMLVideoElement;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      panzoom.setMediaSize(video.videoWidth, video.videoHeight);
      panzoom.fit();
    }
  };
  el.addEventListener("loadedmetadata", applyMeta);
  if (el.readyState >= 1) {
    applyMeta();
  }

  const onDblClick = () => {
    cb.onFullscreenToggle?.();
  };
  if (isVideo) {
    el.addEventListener("dblclick", onDblClick);
  }

  const onMediaError = () => {
    const mediaError = el.error;
    const detail = mediaError ? { code: mediaError.code, message: mediaError.message } : undefined;
    cb.onError(
      createFlvError("render-error", "The media could not be played by this browser.", detail),
    );
  };
  el.addEventListener("error", onMediaError);

  stage.append(el);
  cb.mediaControls?.connect(el);

  // Audio: the element itself stays invisible; the stage shows a placeholder
  // card (icon + filename + duration) while the toolbar acts as the player.
  let card: HTMLElement | null = null;
  if (!isVideo) {
    el.hidden = true;
    card = document.createElement("div");
    card.className = "flv-audio-card";
    card.innerHTML = ICONS.music;
    const name = document.createElement("div");
    name.className = "flv-audio-name";
    name.textContent = loaded.name ?? "Audio";
    const duration = document.createElement("div");
    duration.className = "flv-audio-duration";
    const syncDuration = () => {
      duration.textContent =
        Number.isFinite(el.duration) && el.duration > 0 ? formatMediaTime(el.duration) : "";
    };
    el.addEventListener("durationchange", syncDuration);
    el.addEventListener("loadedmetadata", syncDuration);
    card.append(name, duration);
    stage.append(card);
  }

  return {
    hasPages: false,
    zoomBy: (factor: number) => panzoom?.zoomBy(factor),
    fit: () => panzoom?.fit(),
    hundred: () => panzoom?.setHundred(),
    rotate: () => panzoom?.rotate90(),
    nextPage: () => {},
    prevPage: () => {},
    destroy: () => {
      el.removeEventListener("error", onMediaError);
      if (isVideo) {
        el.removeEventListener("dblclick", onDblClick);
      }
      el.pause();
      el.removeAttribute("src");
      el.load();
      panzoom?.destroy();
      el.remove();
      card?.remove();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
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
  /**
   * Base-dimension mode. The canvas is always painted at the mode's base CSS
   * size and shown at panzoom scale 1, so "100%" (scale 1) is true actual
   * size — CSS px at 96 DPI (1 pt = 96/72 px) — independent of the container,
   * while "fit" re-paints the page at the size that fills the stage.
   */
  let renderMode: "fit" | "hundred" = "fit";
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let firstRendered = false;

  // getDocument may transfer the buffer; always hand pdf.js a fresh copy.
  if (!loaded.blob) {
    throw createFlvError("render-error", "The PDF payload is missing.");
  }
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Paint at the mode's base size: fit fills the stage; hundred is the
    // page's 96-DPI CSS size regardless of the stage.
    const baseScale =
      renderMode === "hundred"
        ? CSS_PER_PT
        : stageFit(base.width, base.height, stage, RENDER_MARGIN, rotation);
    const viewport = pdfPage.getViewport({ scale: baseScale * dpr, rotation });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const cssW = viewport.width / dpr;
    const cssH = viewport.height / dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    panzoom.setMediaSize(cssW, cssH);
    panzoom.setHundred();
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
    fit: () => {
      renderMode = "fit";
      scheduleRender();
    },
    hundred: () => {
      renderMode = "hundred";
      scheduleRender();
    },
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
