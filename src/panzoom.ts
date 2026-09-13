export type PanZoomMode = "hand" | "select";

export interface PanZoomOptions {
  /** Zoom on plain wheel ("always") or only ctrl/cmd+wheel ("ctrl"). */
  wheelMode?: "always" | "ctrl";
  minScale?: number;
  maxScale?: number;
  /** Margin around the media when fitting. */
  margin?: number;
  onZoom?: (scale: number) => void;
  /** Initial interaction mode. Hand drags pan (clamped); select pans nothing. */
  mode?: PanZoomMode;
  /** Wheel zoom. */
  wheel?: boolean;
  /** Single-pointer drag pan (hand mode, clamped). */
  drag?: boolean;
  /** Two-pointer pinch zoom. */
  pinch?: boolean;
  /** Double-click 1x<->2x toggle. */
  dblclickZoom?: boolean;
}

/**
 * Shared transform engine for a media element (image or canvas) inside a stage.
 * Transform order: translate(tx, ty) rotate(r) scale(s), applied about the center.
 * Wheel/pointer interaction is captured on the stage; the transform lands on the media.
 *
 * Panning is clamped: media that fits the stage cannot be moved at all, and
 * overflowing media can never be dragged past its edges (no void around it).
 */
export class PanZoom {
  readonly media: HTMLElement;
  readonly stage: HTMLElement;
  #opts: Required<PanZoomOptions>;
  #mode: PanZoomMode;
  #mediaSize = { width: 0, height: 0 };
  #scale = 1;
  #tx = 0;
  #ty = 0;
  #rotation = 0;
  #pointers = new Map<number, { x: number; y: number }>();
  #pinchStart: { dist: number; scale: number } | null = null;
  #cleanupFns: (() => void)[] = [];

  constructor(stage: HTMLElement, media: HTMLElement, opts: PanZoomOptions = {}) {
    this.stage = stage;
    this.media = media;
    this.#opts = {
      wheelMode: "always",
      minScale: 0.2,
      maxScale: 8,
      margin: 24,
      onZoom: () => {},
      mode: "hand",
      wheel: true,
      drag: true,
      pinch: true,
      dblclickZoom: true,
      ...opts,
    };
    this.#mode = this.#opts.mode;
    this.#applyModeClasses();

    if (this.#opts.wheel) {
      const onWheel = (ev: WheelEvent) => {
        if (this.#opts.wheelMode === "ctrl" && !ev.ctrlKey && !ev.metaKey) {
          return;
        }
        ev.preventDefault();
        this.zoomBy(Math.exp(-ev.deltaY * 0.002), ev.clientX, ev.clientY);
      };
      stage.addEventListener("wheel", onWheel, { passive: false });
      this.#cleanupFns.push(() => stage.removeEventListener("wheel", onWheel));
    }

    const onPointerDown = (ev: PointerEvent) => {
      if (this.#mode === "select") {
        return;
      }
      if (ev.pointerType === "mouse" && ev.button !== 0) {
        return;
      }
      this.#pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.#pointers.size === 2 && this.#opts.pinch) {
        const [a, b] = [...this.#pointers.values()];
        if (a !== undefined && b !== undefined) {
          this.#pinchStart = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            scale: this.#scale,
          };
        }
      }
      try {
        stage.setPointerCapture(ev.pointerId);
      } catch {
        // Pointer already gone (released between events).
      }
      if (this.#scale > 1.001) {
        stage.classList.add("flv-panning");
      }
    };
    const onPointerMove = (ev: PointerEvent) => {
      const prev = this.#pointers.get(ev.pointerId);
      if (!prev) {
        return;
      }
      this.#pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.#pointers.size === 2 && this.#pinchStart) {
        const [a, b] = [...this.#pointers.values()];
        if (a !== undefined && b !== undefined) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > 0) {
            const rect = this.#stageRect();
            this.#zoomAround(
              (dist / this.#pinchStart.dist) * this.#pinchStart.scale,
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
          }
        }
        return;
      }
      if (this.#pointers.size === 1 && this.#opts.drag) {
        this.#tx += ev.clientX - prev.x;
        this.#ty += ev.clientY - prev.y;
        this.#apply();
      }
    };
    const onPointerUp = (ev: PointerEvent) => {
      this.#pointers.delete(ev.pointerId);
      if (this.#pointers.size < 2) {
        this.#pinchStart = null;
      }
      if (this.#pointers.size === 0) {
        this.stage.classList.remove("flv-panning");
      }
    };
    if (this.#opts.drag || this.#opts.pinch) {
      stage.addEventListener("pointerdown", onPointerDown);
      stage.addEventListener("pointermove", onPointerMove);
      stage.addEventListener("pointerup", onPointerUp);
      stage.addEventListener("pointercancel", onPointerUp);
      this.#cleanupFns.push(() => {
        stage.removeEventListener("pointerdown", onPointerDown);
        stage.removeEventListener("pointermove", onPointerMove);
        stage.removeEventListener("pointerup", onPointerUp);
        stage.removeEventListener("pointercancel", onPointerUp);
      });
    }

    if (this.#opts.dblclickZoom) {
      const onDblClick = (ev: MouseEvent) => {
        ev.preventDefault();
        if (this.#scale > 2.001 || Math.abs(this.#scale - 2) < 0.25) {
          this.fit();
        } else {
          this.#zoomAround(2, ev.clientX, ev.clientY);
        }
      };
      media.addEventListener("dblclick", onDblClick);
      this.#cleanupFns.push(() => media.removeEventListener("dblclick", onDblClick));
    }
  }

  #stageRect(): DOMRect {
    return this.stage.getBoundingClientRect();
  }

  /** Absolute-scale setter used by PDF repaints: scale persists, pan recenters. */
  setScale(scale: number): void {
    this.#scale = Math.min(this.#opts.maxScale, Math.max(this.#opts.minScale, scale));
    this.#tx = 0;
    this.#ty = 0;
    this.#apply();
  }

  get mode(): PanZoomMode {
    return this.#mode;
  }

  setMode(mode: PanZoomMode): void {
    this.#mode = mode;
    this.#applyModeClasses();
    if (mode === "select") {
      this.stage.classList.remove("flv-panning");
    }
  }

  #applyModeClasses(): void {
    this.stage.classList.remove("flv-mode-hand", "flv-mode-select");
    this.stage.classList.add(this.#mode === "select" ? "flv-mode-select" : "flv-mode-hand");
  }

  /**
   * Clamp pan offsets so the media rectangle always covers the stage: media
   * that fits cannot move (max 0), overflowing media stops at its edges.
   */
  #clampOffsets(): void {
    const { width, height } = this.#mediaSize;
    if (width <= 0 || height <= 0) {
      return;
    }
    const rect = this.#stageRect();
    const rad = (this.#rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = (width * cos + height * sin) * this.#scale;
    const h = (width * sin + height * cos) * this.#scale;
    const maxX = Math.max(0, (w - rect.width) / 2);
    const maxY = Math.max(0, (h - rect.height) / 2);
    this.#tx = Math.min(maxX, Math.max(-maxX, this.#tx));
    this.#ty = Math.min(maxY, Math.max(-maxY, this.#ty));
  }

  #apply(): void {
    this.#clampOffsets();
    // translate(-50%,-50%) centers the media on its left/top:50% anchor,
    // so (tx, ty) = (0, 0) means "media center == stage center".
    this.media.style.transform = `translate(-50%, -50%) translate(${this.#tx}px, ${this.#ty}px) rotate(${this.#rotation}deg) scale(${this.#scale})`;
    this.#opts.onZoom(this.totalScale);
  }

  get totalScale(): number {
    return this.#scale;
  }

  setMediaSize(width: number, height: number): void {
    this.#mediaSize = { width, height };
  }

  /** Factor that fits mediaSize into the stage (may upscale small media to fill it). */
  fitFactor(): number {
    const rect = this.#stageRect();
    const margin = this.#opts.margin;
    const availW = rect.width - margin * 2;
    const availH = rect.height - margin * 2;
    const { width, height } = this.#mediaSize;
    if (width <= 0 || height <= 0 || availW <= 0 || availH <= 0) {
      return 1;
    }
    const rad = (this.#rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rotW = width * cos + height * sin;
    const rotH = width * sin + height * cos;
    return Math.min(availW / rotW, availH / rotH);
  }

  /** Reset to fit (scale = fitFactor, centered, keeps rotation). */
  fit(): void {
    if (this.#mediaSize.width <= 0) {
      return;
    }
    this.#scale = Math.min(this.#opts.maxScale, Math.max(this.#opts.minScale, this.fitFactor()));
    this.#tx = 0;
    this.#ty = 0;
    this.#apply();
  }

  zoomBy(factor: number, clientX?: number, clientY?: number): void {
    const rect = this.#stageRect();
    this.#zoomAround(
      this.#scale * factor,
      clientX ?? rect.left + rect.width / 2,
      clientY ?? rect.top + rect.height / 2,
    );
  }

  #zoomAround(newScale: number, clientX: number, clientY: number): void {
    const rect = this.#stageRect();
    const clamped = Math.min(this.#opts.maxScale, Math.max(this.#opts.minScale, newScale));
    if (clamped === this.#scale) {
      return;
    }
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const f = clamped / this.#scale;
    // Screen-space zoom around a point is rotation-independent.
    this.#tx = this.#tx * f + dx * (1 - f);
    this.#ty = this.#ty * f + dy * (1 - f);
    this.#scale = clamped;
    this.#apply();
  }

  /** Show media at 1× — 100% original zoom level (1 CSS px per natural pixel). */
  setHundred(): void {
    this.#scale = 1;
    this.#tx = 0;
    this.#ty = 0;
    this.#apply();
  }

  rotate90(): void {
    this.#rotation = (this.#rotation + 90) % 360;
    this.#apply();
  }

  get rotation(): number {
    return this.#rotation;
  }

  destroy(): void {
    for (const fn of this.#cleanupFns) {
      fn();
    }
    this.#cleanupFns = [];
    this.stage.classList.remove("flv-mode-hand", "flv-mode-select", "flv-panning");
  }
}
