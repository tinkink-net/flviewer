import { createFlvError, isAbortError } from "./errors";
import { EventBus } from "./events";
import { ICONS } from "./icons";
import type { LoadedSource } from "./source";
import { loadSource, suggestFilename } from "./source";
import { createTextView } from "./text-view";
import { injectFlvStyles } from "./stylesheet";
import type { FlvError, FlvEventMap, FlvEventType, FlvKind, Source, SourceOptions } from "./types";
import { createImageView, createMediaView, createPdfView, formatMediaTime } from "./views";
import type { FlvView, ViewCallbacks } from "./views";
import { createDocxView } from "./docx-view";
import { createXlsxView } from "./xlsx-view";
import { createPptxView } from "./pptx-view";

export interface CoreOptions {
  isOverlay: boolean;
  /** Overlay only: invoked on user close request (Esc / Close button). */
  requestClose?: () => void;
}

interface ButtonSpec {
  icon: keyof typeof ICONS;
  label: string;
  action: (core: Core) => void;
  /** Stays enabled in loading/error states (e.g. Close). */
  permanent?: boolean;
}

const BUTTONS: ButtonSpec[] = [
  {
    icon: "select",
    label: "Select mode",
    action: (c) => c.setMode("select"),
  },
  {
    icon: "hand",
    label: "Hand mode",
    action: (c) => c.setMode("hand"),
  },
  {
    icon: "zoomIn",
    label: "Zoom in",
    action: (c) => c.view?.zoomBy(1.25),
  },
  {
    icon: "zoomOut",
    label: "Zoom out",
    action: (c) => c.view?.zoomBy(0.8),
  },
  {
    icon: "fit",
    label: "Fit",
    action: (c) => c.view?.fit(),
  },
  {
    icon: "hundred",
    label: "Actual size",
    action: (c) => c.view?.hundred(),
  },
  {
    icon: "rotate",
    label: "Rotate",
    action: (c) => c.view?.rotate(),
  },
  {
    icon: "prev",
    label: "Previous page",
    action: (c) => c.view?.prevPage(),
  },
  {
    icon: "next",
    label: "Next page",
    action: (c) => c.view?.nextPage(),
  },
  {
    icon: "code",
    label: "Toggle source",
    action: (c) => c.view?.toggleSource?.(),
  },
  {
    icon: "download",
    label: "Download",
    action: (c) => c.download(),
  },
  {
    icon: "fullscreen",
    label: "Fullscreen",
    action: (c) => c.toggleFullscreen(),
  },
  {
    icon: "close",
    label: "Close",
    action: (c) => c.requestClose(),
    permanent: true,
  },
];

// Media playback prefs persist across sources within a session.
let savedVolume = 1;
let savedMuted = false;

function errorTitleFor(code: FlvError["code"]): string {
  switch (code) {
    case "fetch-error":
      return "Download failed";
    case "unsupported-type":
      return "Unsupported file";
    case "encrypted-pdf":
    case "encrypted-office":
      return "Password protected";
    case "render-error":
      return "Could not render";
    case "aborted":
      return "Cancelled";
  }
}

type CoreState = "idle" | "loading" | "ready" | "error";

/** Horizontal travel (px) before a touch is committed as a page swipe. */
const SWIPE_THRESHOLD = 48;

/**
 * Primary pointer is coarse (phone/tablet). Pinch and swipe replace the
 * on-screen controls there; a hybrid laptop reports a fine primary pointer,
 * so its buttons stay put.
 */
function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: coarse)").matches;
}

interface SwipeState {
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  active: boolean;
}

export class Core {
  readonly root: HTMLElement;
  readonly bus = new EventBus();
  #stage: HTMLElement;
  #toolbar: HTMLElement;
  #progress: HTMLElement;
  #progressBar: HTMLElement;
  #spinner: HTMLElement;
  #errorBox: HTMLElement;
  #errorTitle: HTMLElement;
  #errorDetail: HTMLElement;
  #pageIndicator: HTMLElement;
  #mediaGroup: HTMLElement;
  #sepMedia: HTMLElement;
  #sepTransform: HTMLElement;
  #sepPager: HTMLElement;
  #playBtn: HTMLButtonElement;
  #timeLabel: HTMLElement;
  #seek: HTMLInputElement;
  #muteBtn: HTMLButtonElement;
  #volume: HTMLInputElement;
  #mediaEl: HTMLMediaElement | null = null;
  #scrubbing = false;
  #mode: "hand" | "select" = "select";
  #view: FlvView | null = null;
  #loaded: LoadedSource | null = null;
  #lastSource: { source: Source; options?: SourceOptions } | null = null;
  #seq = 0;
  #abort: AbortController = new AbortController();
  #state: CoreState = "idle";
  #swipe: SwipeState | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #options: CoreOptions;

  #fullscreenChange = () => {
    const btn = this.#button("Fullscreen");
    btn?.setAttribute("aria-pressed", String(document.fullscreenElement === this.root));
  };

  #keydown = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented) {
      return;
    }
    if (ev.key === "Escape" && this.#options.isOverlay) {
      ev.preventDefault();
      this.#options.requestClose?.();
      return;
    }
    // Media kinds own the keyboard: playback transport instead of zoom/pages.
    const kind = this.#loaded?.kind;
    if ((kind === "video" || kind === "audio") && this.#mediaEl && this.#state === "ready") {
      const target = ev.target as HTMLElement | null;
      const onSlider = target instanceof HTMLInputElement && target.type === "range";
      const onButton = target instanceof HTMLButtonElement;
      if (ev.key === " ") {
        // Focused buttons/sliders activate natively; don't double-toggle.
        if (onButton || onSlider || ev.repeat) {
          return;
        }
        ev.preventDefault();
        this.#togglePlay();
        return;
      }
      switch (ev.key) {
        case "ArrowLeft":
        case "ArrowRight":
          if (onSlider) {
            return; // Native slider stepping already seeks.
          }
          ev.preventDefault();
          this.#seekBy(ev.key === "ArrowLeft" ? -5 : 5);
          return;
        case "ArrowUp":
        case "ArrowDown":
          if (onSlider) {
            return;
          }
          ev.preventDefault();
          this.#volumeBy(ev.key === "ArrowUp" ? 0.1 : -0.1);
          return;
        case "m":
        case "M":
          if (!ev.repeat) {
            this.#toggleMuted();
          }
          return;
        case "h":
        case "H":
          if (!ev.repeat) {
            this.setMode("hand");
          }
          return;
        case "v":
        case "V":
          if (!ev.repeat) {
            this.setMode("select");
          }
          return;
      }
      // +, -, 0 and page arrows are intentionally inert for media.
      return;
    }
    switch (ev.key) {
      case "+":
      case "=":
        ev.preventDefault();
        this.#view?.zoomBy(1.25);
        break;
      case "-":
      case "_":
        ev.preventDefault();
        this.#view?.zoomBy(0.8);
        break;
      case "0":
        ev.preventDefault();
        this.#view?.fit();
        break;
      case "ArrowLeft":
        // Pager kinds navigate; prevent native stage scroll double-acting.
        if (this.#view?.hasPages) {
          ev.preventDefault();
        }
        this.#view?.prevPage();
        break;
      case "ArrowRight":
        if (this.#view?.hasPages) {
          ev.preventDefault();
        }
        this.#view?.nextPage();
        break;
      case "h":
      case "H":
        this.setMode("hand");
        break;
      case "v":
      case "V":
        this.setMode("select");
        break;
    }
  };

  constructor(options: CoreOptions) {
    this.#options = options;
    injectFlvStyles();

    this.root = document.createElement("div");
    this.root.className = "flv-root";
    this.root.tabIndex = 0;
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", "File preview");

    const stage = document.createElement("div");
    stage.className = "flv-stage";
    this.#stage = stage;

    const progress = document.createElement("div");
    progress.className = "flv-progress";
    progress.hidden = true;
    this.#progress = progress;
    const bar = document.createElement("div");
    bar.className = "flv-progress-bar";
    this.#progressBar = bar;
    progress.append(bar);

    const spinner = document.createElement("div");
    spinner.className = "flv-spinner";
    spinner.hidden = true;
    this.#spinner = spinner;

    const errorBox = document.createElement("div");
    errorBox.className = "flv-error";
    errorBox.hidden = true;
    this.#errorBox = errorBox;
    const box = document.createElement("div");
    box.className = "flv-error-box";
    box.setAttribute("role", "alert");
    box.innerHTML = ICONS.error;
    const title = document.createElement("div");
    title.className = "flv-error-title";
    this.#errorTitle = title;
    const detail = document.createElement("div");
    detail.className = "flv-error-detail";
    this.#errorDetail = detail;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "flv-retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => this.retry());
    box.append(title, detail, retry);
    errorBox.append(box);

    const toolbar = document.createElement("div");
    toolbar.className = "flv-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Viewer controls");
    this.#toolbar = toolbar;

    // Media group (video/audio): play/pause · seek+time · mute/volume.
    const mediaGroup = document.createElement("div");
    mediaGroup.className = "flv-media-group";
    mediaGroup.hidden = true;
    this.#mediaGroup = mediaGroup;
    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "flv-btn";
    playBtn.setAttribute("aria-label", "Play");
    playBtn.title = "Play";
    playBtn.innerHTML = ICONS.play;
    playBtn.addEventListener("click", () => this.#togglePlay());
    this.#playBtn = playBtn;
    const timeLabel = document.createElement("span");
    timeLabel.className = "flv-time";
    timeLabel.textContent = "0:00 / 0:00";
    this.#timeLabel = timeLabel;
    const seek = document.createElement("input");
    seek.type = "range";
    seek.className = "flv-media-slider flv-seek";
    seek.min = "0";
    seek.max = "1000";
    seek.step = "1";
    seek.value = "0";
    seek.setAttribute("aria-label", "Seek");
    seek.addEventListener("input", () => this.#onSeekInput());
    seek.addEventListener("change", () => {
      this.#scrubbing = false;
    });
    this.#seek = seek;
    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "flv-btn";
    muteBtn.setAttribute("aria-label", "Mute");
    muteBtn.title = "Mute";
    muteBtn.innerHTML = ICONS.volume;
    muteBtn.addEventListener("click", () => this.#toggleMuted());
    this.#muteBtn = muteBtn;
    const volume = document.createElement("input");
    volume.type = "range";
    volume.className = "flv-media-slider flv-volume";
    volume.min = "0";
    volume.max = "100";
    volume.step = "1";
    volume.value = "100";
    volume.setAttribute("aria-label", "Volume");
    volume.addEventListener("input", () => this.#onVolumeInput());
    this.#volume = volume;
    mediaGroup.append(playBtn, timeLabel, seek, muteBtn, volume);
    toolbar.append(mediaGroup);

    const sep = document.createElement("div");
    sep.className = "flv-sep";
    const sepMedia = sep.cloneNode(true) as HTMLElement;
    sepMedia.hidden = true;
    this.#sepMedia = sepMedia;
    toolbar.append(sepMedia);
    const indicator = document.createElement("span");
    indicator.className = "flv-page-indicator";
    indicator.hidden = true;
    this.#pageIndicator = indicator;
    this.#sepTransform = sep.cloneNode(true) as HTMLElement;
    this.#sepTransform.hidden = true;
    this.#sepPager = sep.cloneNode(true) as HTMLElement;
    this.#sepPager.hidden = true;
    for (const spec of BUTTONS) {
      // Indicator sits between the two pager buttons.
      if (spec.label === "Next page") {
        toolbar.append(indicator);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "flv-btn";
      btn.setAttribute("aria-label", spec.label);
      btn.title = spec.label;
      btn.dataset.flvPermanent = String(Boolean(spec.permanent));
      btn.innerHTML = ICONS[spec.icon];
      btn.addEventListener("click", () => spec.action(this));
      if (spec.label === "Select mode" || spec.label === "Hand mode") {
        btn.setAttribute("aria-pressed", "false");
      }
      if (spec.label === "Toggle source") {
        btn.setAttribute("aria-pressed", "false");
      }
      if (spec.icon === "prev" || spec.icon === "next") {
        btn.dataset.flvPager = "true";
      }
      toolbar.append(btn);
      if (spec.label === "Rotate") {
        toolbar.append(this.#sepTransform);
      }
      if (spec.label === "Next page") {
        toolbar.append(this.#sepPager);
      }
    }

    this.#updateToolbarForKind(null);
    this.#syncModeButtons();
    this.root.append(stage, progress, spinner, errorBox, toolbar);
    this.root.addEventListener("keydown", this.#keydown);
    stage.addEventListener("pointerdown", this.#onStagePointerDown);
    stage.addEventListener("pointermove", this.#onStagePointerMove);
    stage.addEventListener("pointerup", this.#onStagePointerUp);
    stage.addEventListener("pointercancel", this.#onStagePointerCancel);
    document.addEventListener("fullscreenchange", this.#fullscreenChange);

    if (!this.#options.isOverlay) {
      this.#button("Close")!.hidden = true;
    }
    if (!document.fullscreenEnabled) {
      this.#button("Fullscreen")!.hidden = true;
    }

    if (typeof ResizeObserver !== "undefined") {
      let armed = false;
      let lastWidth = 0;
      let lastHeight = 0;
      this.#resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        const { width, height } = entry.contentRect;
        if (!armed) {
          // Layout-establishment fires (0×0 → actual size) must not refit —
          // the view already fits on creation, and a late one would clobber a
          // user zoom. Arm on the first real size, react only to changes after.
          if (width > 0 && height > 0) {
            armed = true;
            lastWidth = width;
            lastHeight = height;
          }
          return;
        }
        if (width === lastWidth && height === lastHeight) {
          return;
        }
        lastWidth = width;
        lastHeight = height;
        if (width > 0 && height > 0 && this.#state === "ready") {
          this.#view?.fit();
        }
      });
      this.#resizeObserver.observe(stage);
    }
  }

  #button(label: string): HTMLButtonElement | null {
    return this.#toolbar.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

  /**
   * Touch page swiping. Only for coarse-pointer devices, select mode (hand
   * mode owns drag-to-pan) and page views that opt in (`swipeNav`) — the
   * pager arrows are hidden there, so the gesture is the navigation.
   */
  #swipeEnabled(): boolean {
    return (
      this.#state === "ready" &&
      this.#mode === "select" &&
      isCoarsePointer() &&
      this.#view?.swipeNav === true
    );
  }

  #onStagePointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType !== "touch" || !this.#swipeEnabled()) {
      return;
    }
    if (this.#swipe && this.#swipe.pointerId !== ev.pointerId) {
      // A second finger means pinch zoom — abandon the pending swipe.
      this.#swipe = null;
      return;
    }
    this.#swipe = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      dx: 0,
      active: false,
    };
  };

  #onStagePointerMove = (ev: PointerEvent): void => {
    const swipe = this.#swipe;
    if (!swipe || swipe.pointerId !== ev.pointerId) {
      return;
    }
    const dx = ev.clientX - swipe.startX;
    const dy = ev.clientY - swipe.startY;
    if (!swipe.active) {
      // Commit only to a clearly horizontal drag; vertical intent is a scroll.
      if (Math.abs(dx) < SWIPE_THRESHOLD / 4 || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      swipe.active = true;
    }
    swipe.dx = dx;
  };

  #onStagePointerUp = (ev: PointerEvent): void => {
    const swipe = this.#swipe;
    if (!swipe || swipe.pointerId !== ev.pointerId) {
      return;
    }
    this.#swipe = null;
    if (!swipe.active) {
      return;
    }
    if (swipe.dx <= -SWIPE_THRESHOLD) {
      this.#view?.nextPage();
    } else if (swipe.dx >= SWIPE_THRESHOLD) {
      this.#view?.prevPage();
    }
  };

  /** An interrupted gesture (system scroll, etc.) navigates nothing. */
  #onStagePointerCancel = (ev: PointerEvent): void => {
    if (this.#swipe?.pointerId === ev.pointerId) {
      this.#swipe = null;
    }
  };

  /** User close request (Esc / Close button) — Overlay only. */
  requestClose(): void {
    this.#options.requestClose?.();
  }

  get state(): CoreState {
    return this.#state;
  }

  get view(): FlvView | null {
    return this.#view;
  }

  on<K extends FlvEventType>(type: K, cb: (detail: FlvEventMap[K]) => void): () => void {
    return this.bus.on(type, cb);
  }

  emit<K extends FlvEventType>(type: K, detail: FlvEventMap[K]): void {
    this.bus.emit(type, detail);
    this.root.dispatchEvent(
      new CustomEvent(`flv:${type}`, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  load(source: Source, options?: SourceOptions): void {
    const seq = ++this.#seq;
    this.#abort.abort();
    this.#abort = new AbortController();
    this.#lastSource = { source, options };
    this.#applyState("loading");
    if (options?.title) {
      this.root.setAttribute("aria-label", options.title);
    }

    const callbacks: ViewCallbacks = {
      wheelMode: this.#options.isOverlay ? "always" : "ctrl",
      mode: this.#mode,
      onZoom: (scale) => this.emit("zoom", { scale }),
      onError: (err) => this.#fail(seq, err),
      onPageChange: (page, total) => {
        this.#updatePageIndicator(page, total);
        this.emit("pagechange", { page, total });
      },
      onFullscreenToggle: () => this.toggleFullscreen(),
      mediaControls: { connect: this.#connectMedia },
      onTruncated: (detail) => this.emit("truncated", detail),
      onDownload: () => this.download(),
      onSourceToggle: (sourceMode) => {
        this.#button("Toggle source")?.setAttribute("aria-pressed", String(sourceMode));
      },
      baseUrl: options?.baseUrl,
      transformAssetUrl: options?.transformAssetUrl,
      transformLinkUrl: options?.transformLinkUrl,
    };

    void loadSource(source, {
      requestInit: options?.requestInit,
      signal: this.#abort.signal,
      onProgress: (loadedBytes, total) => {
        if (seq !== this.#seq) {
          return;
        }
        if (total && total > 0) {
          this.#progressBar.style.width = `${Math.min(100, (loadedBytes / total) * 100)}%`;
        } else {
          this.#progress.classList.add("flv-indeterminate");
        }
      },
    })
      .then(async (loaded) => {
        if (seq !== this.#seq) {
          return;
        }
        this.#loaded = loaded;
        this.#updateToolbarForKind(loaded.kind);
        this.#destroyView();
        try {
          this.#view =
            loaded.kind === "pdf"
              ? await createPdfView(this.#stage, loaded, callbacks)
              : loaded.kind === "docx"
                ? await createDocxView(this.#stage, loaded, callbacks)
                : loaded.kind === "xlsx"
                  ? await createXlsxView(this.#stage, loaded, callbacks)
                  : loaded.kind === "pptx"
                    ? await createPptxView(this.#stage, loaded, callbacks)
                    : loaded.kind === "video" || loaded.kind === "audio"
                      ? createMediaView(this.#stage, loaded, callbacks)
                      : loaded.kind === "text"
                        ? await createTextView(this.#stage, loaded, callbacks)
                        : createImageView(this.#stage, loaded, callbacks);
        } catch (err) {
          if (isAbortError(err)) {
            return;
          }
          this.#fail(
            seq,
            typeof err === "object" && err !== null && "code" in err
              ? (err as FlvError)
              : createFlvError("render-error", "The file could not be rendered.", err),
          );
          return;
        }
        if (seq !== this.#seq) {
          this.#view.destroy();
          this.#view = null;
          return;
        }
        this.#updatePageIndicator(1, this.#view?.pageCount ?? 1);
        this.#applyState("ready");
        this.emit("ready", {
          kind: loaded.kind,
          pages: this.#view?.pageCount,
          name: loaded.name,
          textKind: loaded.kind === "text" ? loaded.textKind : undefined,
        });
      })
      .catch((err) => {
        if (seq !== this.#seq || isAbortError(err)) {
          return;
        }
        this.#fail(
          seq,
          typeof err === "object" && err !== null && "code" in err
            ? (err as FlvError)
            : createFlvError("render-error", "The file could not be rendered.", err),
        );
      });
  }

  retry(): void {
    if (this.#lastSource) {
      this.load(this.#lastSource.source, this.#lastSource.options);
    }
  }

  #fail(seq: number, err: FlvError): void {
    if (seq !== this.#seq) {
      return;
    }
    this.#destroyView();
    this.#errorTitle.textContent = errorTitleFor(err.code);
    this.#errorDetail.textContent = err.message;
    this.#applyState("error");
    this.emit("error", { error: err });
  }

  #applyState(state: CoreState): void {
    this.#state = state;
    this.#progress.hidden = state !== "loading";
    this.#spinner.hidden = state !== "loading";
    if (state !== "loading") {
      this.#progress.classList.remove("flv-indeterminate");
      this.#progressBar.style.width = "0%";
    }
    this.#errorBox.hidden = state !== "error";
    const interactive = state === "ready";
    const controls = this.#toolbar.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      ".flv-btn, .flv-media-slider, .flv-sheet-select",
    );
    for (const ctl of controls) {
      if (ctl.dataset.flvPermanent !== "true") {
        ctl.disabled = !interactive;
      }
    }
  }

  #updatePageIndicator(page: number, total: number): void {
    const view = this.#view;
    const hasPages = view?.hasPages === true;
    this.#pageIndicator.hidden = !hasPages;
    // XLSX replaces the `page / total` label with its sheet dropdown (ADR-7).
    const selector = view?.pageSelector ?? null;
    if (selector) {
      if (this.#pageIndicator.firstElementChild !== selector) {
        this.#pageIndicator.replaceChildren(selector);
      }
    } else {
      this.#pageIndicator.textContent = hasPages ? `${page} / ${total}` : "";
    }
    for (const btn of this.#toolbar.querySelectorAll<HTMLButtonElement>(
      'button[data-flv-pager="true"]',
    )) {
      // Touch page views are swipe-navigated, so the arrows step aside.
      btn.hidden = !hasPages || (view?.swipeNav === true && isCoarsePointer());
    }
    this.#sepPager.hidden = !hasPages;
    const prev = this.#button("Previous page");
    const next = this.#button("Next page");
    if (prev) {
      prev.disabled = page <= 1;
    }
    if (next) {
      next.disabled = page >= total;
    }
  }

  /** Kind-aware toolbar: mode group, transform group, media group, pager group. */
  #updateToolbarForKind(kind: FlvKind | null): void {
    const showBtn = (label: string, visible: boolean) => {
      const btn = this.#button(label);
      if (btn) {
        btn.hidden = !visible;
      }
    };
    const isOfficePannable = kind === "docx" || kind === "pptx";
    const isDoc = kind === "image" || kind === "pdf" || isOfficePannable;
    const isVideo = kind === "video";
    const isMedia = isVideo || kind === "audio";
    const hasPanZoom = isDoc || isVideo;
    // Pinch replaces the continuous zoom buttons on touch devices.
    const zoomButtons = isDoc && !isCoarsePointer();
    showBtn("Select mode", hasPanZoom);
    showBtn("Hand mode", hasPanZoom);
    showBtn("Zoom in", zoomButtons);
    showBtn("Zoom out", zoomButtons);
    showBtn("Fit", isDoc || isVideo);
    showBtn("Actual size", isDoc || isVideo);
    // Rotation is a fixed-page/raster transform — flow kinds don't offer it.
    showBtn("Rotate", kind === "image" || kind === "pdf");
    showBtn("Toggle source", kind === "text" && this.#loaded?.textKind === "markdown");
    if (kind !== "text" || this.#loaded?.textKind !== "markdown") {
      // New source: the toggle resets to rendered mode.
      this.#button("Toggle source")?.setAttribute("aria-pressed", "false");
    }
    this.#mediaGroup.hidden = !isMedia;
    this.#sepMedia.hidden = !isVideo;
    this.#sepTransform.hidden = !hasPanZoom;
  }

  /** Switch the interaction mode (hand pans clamped; select pans nothing). */
  setMode(mode: "hand" | "select"): void {
    this.#mode = mode;
    this.#syncModeButtons();
    this.#view?.setMode(mode);
  }

  #syncModeButtons(): void {
    this.#button("Select mode")?.setAttribute("aria-pressed", String(this.#mode === "select"));
    this.#button("Hand mode")?.setAttribute("aria-pressed", String(this.#mode === "hand"));
  }

  #connectMedia = (el: HTMLMediaElement): void => {
    this.#mediaEl = el;
    el.volume = savedVolume;
    el.muted = savedMuted;
    el.addEventListener("play", this.#syncMediaState);
    el.addEventListener("pause", this.#syncMediaState);
    el.addEventListener("timeupdate", this.#syncMediaState);
    el.addEventListener("durationchange", this.#syncMediaState);
    el.addEventListener("loadedmetadata", this.#syncMediaState);
    el.addEventListener("volumechange", () => {
      savedVolume = el.volume;
      savedMuted = el.muted;
      this.#syncMediaState();
    });
    this.#syncMediaState();
  };

  #syncMediaState = (): void => {
    const el = this.#mediaEl;
    if (!el) {
      return;
    }
    const duration = el.duration;
    const finite = typeof duration === "number" && Number.isFinite(duration) && duration > 0;
    this.#playBtn.innerHTML = el.paused ? ICONS.play : ICONS.pause;
    this.#playBtn.setAttribute("aria-label", el.paused ? "Play" : "Pause");
    this.#playBtn.title = el.paused ? "Play" : "Pause";
    const current = formatMediaTime(el.currentTime);
    this.#timeLabel.textContent = finite ? `${current} / ${formatMediaTime(duration)}` : current;
    this.#seek.disabled = !finite;
    if (!this.#scrubbing && finite) {
      this.#seek.value = String(Math.round((el.currentTime / duration) * 1000));
    }
    const muted = el.muted || el.volume === 0;
    this.#muteBtn.innerHTML = muted ? ICONS.volumeMuted : ICONS.volume;
    this.#muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    this.#muteBtn.title = muted ? "Unmute" : "Mute";
    this.#volume.value = String(Math.round(el.volume * 100));
  };

  #togglePlay(): void {
    const el = this.#mediaEl;
    if (!el) {
      return;
    }
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
    this.#syncMediaState();
  }

  #onSeekInput(): void {
    const el = this.#mediaEl;
    if (!el) {
      return;
    }
    this.#scrubbing = true;
    const duration = el.duration;
    if (Number.isFinite(duration) && duration > 0) {
      el.currentTime = (this.#seek.valueAsNumber / 1000) * duration;
    }
    this.#syncMediaState();
  }

  #toggleMuted(): void {
    const el = this.#mediaEl;
    if (!el) {
      return;
    }
    el.muted = !el.muted;
    this.#syncMediaState();
  }

  #onVolumeInput(): void {
    const el = this.#mediaEl;
    if (!el) {
      return;
    }
    el.volume = this.#volume.valueAsNumber / 100;
    if (el.volume > 0 && el.muted) {
      el.muted = false;
    }
    savedVolume = el.volume;
    savedMuted = el.muted;
    this.#syncMediaState();
  }

  #seekBy(sec: number): void {
    const el = this.#mediaEl;
    if (!el) {
      return;
    }
    const duration = el.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }
    el.currentTime = Math.min(duration, Math.max(0, el.currentTime + sec));
    this.#syncMediaState();
  }

  #volumeBy(delta: number): void {
    const el = this.#mediaEl;
    if (!el) {
      return;
    }
    el.volume = Math.min(1, Math.max(0, Math.round((el.volume + delta) * 100) / 100));
    this.#syncMediaState();
  }

  #destroyView(): void {
    this.#mediaEl = null;
    this.#scrubbing = false;
    this.#swipe = null;
    this.#view?.destroy();
    this.#view = null;
    this.#stage.replaceChildren();
    // Reset the pager slot (a view-owned sheet selector may be mounted).
    this.#pageIndicator.replaceChildren();
    this.#pageIndicator.textContent = "";
  }

  download(): void {
    const loaded = this.#loaded;
    if (!loaded) {
      return;
    }
    const a = document.createElement("a");
    if (loaded.blob) {
      const url = URL.createObjectURL(loaded.blob);
      a.href = url;
      // Note: for cross-origin streaming URLs the download attribute is
      // ignored by browsers and the media opens instead — acceptable for v1.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (loaded.url) {
      a.href = loaded.url;
    } else {
      return;
    }
    a.download = suggestFilename(loaded);
    document.body.append(a);
    a.click();
    a.remove();
  }

  toggleFullscreen(): void {
    if (!document.fullscreenEnabled) {
      return;
    }
    if (document.fullscreenElement === this.root) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void this.root.requestFullscreen().catch(() => {});
    }
  }

  focusToolbar(): void {
    (this.#button("Close") ?? this.root).focus();
  }

  destroy(): void {
    this.#seq += 1;
    this.#abort.abort();
    this.#destroyView();
    this.#resizeObserver?.disconnect();
    document.removeEventListener("fullscreenchange", this.#fullscreenChange);
    this.root.removeEventListener("keydown", this.#keydown);
    this.#stage.removeEventListener("pointerdown", this.#onStagePointerDown);
    this.#stage.removeEventListener("pointermove", this.#onStagePointerMove);
    this.#stage.removeEventListener("pointerup", this.#onStagePointerUp);
    this.#stage.removeEventListener("pointercancel", this.#onStagePointerCancel);
    this.bus.clear();
  }
}
