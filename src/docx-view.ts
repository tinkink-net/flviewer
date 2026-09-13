import { createFlvError } from "./errors";
import type { LoadedSource } from "./source";
import { PanZoom } from "./panzoom";
import type { PanZoomMode } from "./panzoom";
import type { FlvView, ViewCallbacks } from "./views";

type DocxPreview = typeof import("docx-preview");

/**
 * DOCX view (ADR-7): docx-preview renders continuous stacked pages into one
 * container; PanZoom treats the container like a PDF page (fit fills the
 * stage, 100% is the native 96-DPI page size). No pager — pages flow
 * vertically. The engine's own stylesheet is injected into the container and
 * re-scoped by the flv- overrides in styles.ts (ADR-3).
 */
export async function createDocxView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): Promise<FlvView> {
  if (!loaded.blob) {
    throw createFlvError("render-error", "The document payload is missing.");
  }
  let docxPreview: DocxPreview;
  try {
    docxPreview = await import("docx-preview");
  } catch (err) {
    throw createFlvError("render-error", "The document engine could not be loaded.", err);
  }

  const media = document.createElement("div");
  media.className = "flv-media flv-docx";
  stage.append(media);

  const panzoom = new PanZoom(stage, media, {
    wheelMode: cb.wheelMode,
    mode: cb.mode,
    onZoom: cb.onZoom,
  });

  try {
    await docxPreview.renderAsync(loaded.blob, media, media, {
      inWrapper: true,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      experimental: true,
    });
  } catch (err) {
    throw createFlvError("render-error", "The document could not be rendered.", err);
  }

  // Embedded media are blob URLs created by the engine — track and revoke.
  const blobUrls = [...media.querySelectorAll<HTMLImageElement>("img[src^='blob:']")]
    .map((img) => img.src)
    .filter((src) => src.startsWith("blob:"));

  const measure = (): { width: number; height: number } => ({
    width: media.offsetWidth,
    height: media.offsetHeight,
  });
  const size = measure();
  if (size.width > 0 && size.height > 0) {
    panzoom.setMediaSize(size.width, size.height);
    panzoom.fit();
  }

  return {
    hasPages: false,
    zoomBy: (factor: number) => panzoom.zoomBy(factor),
    fit: () => panzoom.fit(),
    hundred: () => panzoom.setHundred(),
    rotate: () => {},
    nextPage: () => {},
    prevPage: () => {},
    setMode: (mode: PanZoomMode) => panzoom.setMode(mode),
    destroy: () => {
      panzoom.destroy();
      for (const url of blobUrls) {
        URL.revokeObjectURL(url);
      }
      media.remove();
    },
  };
}
