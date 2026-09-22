import { createFlvError } from "./errors";
import type { LoadedSource } from "./source";
import { PanZoom } from "./panzoom";
import type { PanZoomMode } from "./panzoom";
import type { FlvView, ViewCallbacks } from "./views";

type PptxModule = typeof import("@aiden0z/pptx-renderer");

/**
 * PPTX view (ADR-7): one slide at a time via @aiden0z/pptx-renderer, mapped
 * onto the PDF-style pager (prev/next + `pagechange`). The viewer renders at
 * the slide's intrinsic size (`fitMode: "none"`) and PanZoom owns all
 * fit/zoom/pan transforms — one zoom system, not two.
 */
export async function createPptxView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): Promise<FlvView> {
  if (!loaded.blob) {
    throw createFlvError("render-error", "The presentation payload is missing.");
  }
  let pptxModule: PptxModule;
  try {
    pptxModule = await import("@aiden0z/pptx-renderer");
  } catch (err) {
    throw createFlvError("render-error", "The presentation engine could not be loaded.", err);
  }

  const media = document.createElement("div");
  media.className = "flv-media flv-pptx";
  stage.append(media);

  const panzoom = new PanZoom(stage, media, {
    wheelMode: cb.wheelMode,
    mode: cb.mode,
    onZoom: cb.onZoom,
  });

  const viewer = new pptxModule.PptxViewer(media, {
    fitMode: "none",
    onSlideError: (index, error) => {
      cb.onError(
        createFlvError("render-error", `Slide ${index + 1} could not be rendered.`, error),
      );
    },
    onSlideRendered: () => {
      cb.onFirstRender?.();
    },
  });

  try {
    await viewer.open(await loaded.blob.arrayBuffer(), { renderMode: "slide" });
  } catch (err) {
    viewer.destroy();
    throw createFlvError("render-error", "The presentation could not be opened.", err);
  }

  const count = Math.max(1, viewer.slideCount);
  const width = viewer.slideWidth;
  const height = viewer.slideHeight;
  media.style.width = `${width}px`;
  media.style.height = `${height}px`;
  panzoom.setMediaSize(width, height);
  panzoom.fit();

  let page = 0;
  let renderSeq = 0;

  async function goTo(index: number, notify: boolean): Promise<void> {
    const target = Math.min(Math.max(0, index), count - 1);
    if (target === page) {
      return;
    }
    const seq = ++renderSeq;
    try {
      await viewer.renderSlide(target);
    } catch (err) {
      if (seq === renderSeq) {
        cb.onError(createFlvError("render-error", "The slide could not be rendered.", err));
      }
      return;
    }
    if (seq !== renderSeq) {
      return;
    }
    page = target;
    if (notify) {
      cb.onPageChange?.(page + 1, count);
    }
  }

  return {
    hasPages: true,
    swipeNav: true,
    pageCount: count,
    zoomBy: (factor: number) => panzoom.zoomBy(factor),
    fit: () => panzoom.fit(),
    hundred: () => panzoom.setHundred(),
    rotate: () => {},
    nextPage: () => void goTo(page + 1, true),
    prevPage: () => void goTo(page - 1, true),
    setMode: (mode: PanZoomMode) => panzoom.setMode(mode),
    destroy: () => {
      renderSeq += 1;
      panzoom.destroy();
      viewer.destroy();
      media.remove();
    },
  };
}
