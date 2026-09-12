import { createFlvError, isAbortError } from "./errors";
import { EventBus } from "./events";
import { ICONS } from "./icons";
import { loadSource, suggestFilename } from "./source";
import type { LoadedSource } from "./source";
import { injectFlvStyles } from "./stylesheet";
import type { FlvError, FlvEventMap, FlvEventType, Source, SourceOptions } from "./types";
import { createImageView, createPdfView } from "./views";
import type { FlvView, ViewCallbacks } from "./views";

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

function errorTitleFor(code: FlvError["code"]): string {
  switch (code) {
    case "fetch-error":
      return "Download failed";
    case "unsupported-type":
      return "Unsupported file";
    case "encrypted-pdf":
      return "Password protected";
    case "render-error":
      return "Could not render";
    case "aborted":
      return "Cancelled";
  }
}

type CoreState = "idle" | "loading" | "ready" | "error";

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
  #view: FlvView | null = null;
  #loaded: LoadedSource | null = null;
  #lastSource: { source: Source; options?: SourceOptions } | null = null;
  #seq = 0;
  #abort: AbortController = new AbortController();
  #state: CoreState = "idle";
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
    switch (ev.key) {
      case "Escape":
        if (this.#options.isOverlay) {
          ev.preventDefault();
          this.#options.requestClose?.();
        }
        break;
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
        this.#view?.prevPage();
        break;
      case "ArrowRight":
        this.#view?.nextPage();
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

    const sep = document.createElement("div");
    sep.className = "flv-sep";
    const indicator = document.createElement("span");
    indicator.className = "flv-page-indicator";
    indicator.hidden = true;
    this.#pageIndicator = indicator;
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
      if (spec.icon === "prev" || spec.icon === "next") {
        btn.dataset.flvPager = "true";
      }
      toolbar.append(btn);
      if (spec.label === "Rotate") {
        toolbar.append(sep.cloneNode(true));
      }
      if (spec.label === "Next page") {
        toolbar.append(sep.cloneNode(true));
      }
    }

    this.root.append(stage, progress, spinner, errorBox, toolbar);
    this.root.addEventListener("keydown", this.#keydown);
    document.addEventListener("fullscreenchange", this.#fullscreenChange);

    if (!this.#options.isOverlay) {
      this.#button("Close")!.hidden = true;
    }
    if (!document.fullscreenEnabled) {
      this.#button("Fullscreen")!.hidden = true;
    }

    if (typeof ResizeObserver !== "undefined") {
      this.#resizeObserver = new ResizeObserver(() => {
        if (this.#state === "ready") {
          this.#view?.fit();
        }
      });
      this.#resizeObserver.observe(stage);
    }
  }

  #button(label: string): HTMLButtonElement | null {
    return this.#toolbar.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

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
      onZoom: (scale) => this.emit("zoom", { scale }),
      onError: (err) => this.#fail(seq, err),
      onPageChange: (page, total) => {
        this.#updatePageIndicator(page, total);
        this.emit("pagechange", { page, total });
      },
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
        this.#destroyView();
        try {
          this.#view =
            loaded.kind === "pdf"
              ? await createPdfView(this.#stage, loaded, callbacks)
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
    for (const btn of this.#toolbar.querySelectorAll<HTMLButtonElement>(".flv-btn")) {
      if (btn.dataset.flvPermanent !== "true") {
        btn.disabled = !interactive;
      }
    }
  }

  #updatePageIndicator(page: number, total: number): void {
    const isPdf = this.#view?.hasPages === true;
    this.#pageIndicator.hidden = !isPdf;
    this.#pageIndicator.textContent = isPdf ? `${page} / ${total}` : "";
    for (const btn of this.#toolbar.querySelectorAll<HTMLButtonElement>(
      'button[data-flv-pager="true"]',
    )) {
      btn.hidden = !isPdf;
    }
    const prev = this.#button("Previous page");
    const next = this.#button("Next page");
    if (prev) {
      prev.disabled = page <= 1;
    }
    if (next) {
      next.disabled = page >= total;
    }
  }

  #destroyView(): void {
    this.#view?.destroy();
    this.#view = null;
    this.#stage.replaceChildren();
  }

  download(): void {
    if (!this.#loaded) {
      return;
    }
    const url = URL.createObjectURL(this.#loaded.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestFilename(this.#loaded);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    this.bus.clear();
  }
}
