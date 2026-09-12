export interface PanZoomOptions {
  /** Zoom on plain wheel ("always") or only ctrl/cmd+wheel ("ctrl"). */
  wheelMode?: "always" | "ctrl";
  minScale?: number;
  maxScale?: number;
  /** Margin around the media when fitting. */
  margin?: number;
  onZoom?: (scale: number) => void;
}

export interface Transform {
  scale: number;
  tx: number;
  ty: number;
  rotation: number;
}

/**
 * Shared transform engine for a media element (image or canvas) inside a stage.
 * Transform order: translate(tx, ty) rotate(r) scale(s), applied about the center.
 * Wheel/pointer interaction is captured on the stage; the transform lands on the media.
 */
export class PanZoom {
  readonly media: HTMLElement;
  readonly stage: HTMLElement;
  #opts: Required<PanZoomOptions>;
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
      ...opts,
    };

    const onWheel = (ev: WheelEvent) => {
      if (this.#opts.wheelMode === "ctrl" && !ev.ctrlKey && !ev.metaKey) {
        return;
      }
      ev.preventDefault();
      this.zoomBy(Math.exp(-ev.deltaY * 0.002), ev.clientX, ev.clientY);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    this.#cleanupFns.push(() => stage.removeEventListener("wheel", onWheel));

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) {
        return;
      }
      this.#pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.#pointers.size === 2) {
        const [a, b] = [...this.#pointers.values()];
        if (a !== undefined && b !== undefined) {
          this.#pinchStart = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            scale: this.#scale,
          };
        }
      }
      stage.setPointerCapture(ev.pointerId);
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
      if (this.#pointers.size === 1) {
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

  #stageRect(): DOMRect {
    return this.stage.getBoundingClientRect();
  }

  #apply(): void {
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

  /** Factor that fits mediaSize into the stage (≤ 1: never upscale). */
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
    return Math.min(availW / rotW, availH / rotH, 1);
  }

  /** Reset to fit (scale = fitFactor, centered, keeps rotation). */
  fit(): void {
    if (this.#mediaSize.width <= 0) {
      return;
    }
    this.#scale = Math.max(this.#opts.minScale, this.fitFactor());
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

  /** Show media at 1× (natural size for images; fit-painted size for PDF). */
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
  }
}
