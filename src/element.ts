import { mount } from "./embed";
import type { FlvController, FlvEventMap, FlvEventType, FlvUrlTransform, Source } from "./types";

const ELEMENT_NAME = "fl-viewer";

/**
 * `<fl-viewer>` — custom element wrapping the Core, rendered in light DOM.
 * Attributes: `src` (URL). Complex values (`source`, `requestInit`,
 * `transformAssetUrl`, …) via properties. Same semantics as the Controller.
 */
export class FlViewerElement extends HTMLElement {
  static observedAttributes = ["src"];

  #controller: FlvController | null = null;
  #source: Source | null = null;
  #requestInit: RequestInit | undefined;
  #baseUrl: string | undefined;
  #transformAssetUrl: FlvUrlTransform | undefined;
  #transformLinkUrl: FlvUrlTransform | undefined;
  #connected = false;

  #options() {
    return {
      requestInit: this.#requestInit,
      baseUrl: this.#baseUrl,
      transformAssetUrl: this.#transformAssetUrl,
      transformLinkUrl: this.#transformLinkUrl,
    };
  }

  connectedCallback(): void {
    this.#connected = true;
    if (this.#source !== null) {
      this.#ensureController();
      this.#controller?.update(this.#source, this.#options());
    }
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#controller?.destroy();
    this.#controller = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === "src" && oldValue !== newValue) {
      this.#source = newValue;
      if (this.#connected && newValue !== null) {
        this.#ensureController();
        this.#controller?.update(newValue, this.#options());
      }
    }
  }

  #ensureController(): void {
    if (this.#controller || this.#source === null) {
      return;
    }
    this.#controller = mount(this, this.#source, this.#options());
  }

  /** URL source, same as the `src` attribute. */
  get src(): string | null {
    return this.getAttribute("src");
  }
  set src(value: string | null) {
    if (value === null) {
      this.removeAttribute("src");
    } else {
      this.setAttribute("src", value);
    }
  }

  /** Any Source (Blob, File, ArrayBuffer, Uint8Array, URL). */
  get source(): Source | null {
    return this.#source;
  }
  set source(value: Source | null) {
    this.#source = value;
    if (this.#connected && value !== null) {
      this.#ensureController();
      this.#controller?.update(value, this.#options());
    }
  }

  /** Fetch options applied to URL sources. */
  get requestInit(): RequestInit | undefined {
    return this.#requestInit;
  }
  set requestInit(value: RequestInit | undefined) {
    this.#requestInit = value;
    if (this.#connected && this.#source !== null) {
      this.#controller?.update(this.#source, this.#options());
    }
  }

  /** Markdown asset base for relative references (ADR-6). */
  get baseUrl(): string | undefined {
    return this.#baseUrl;
  }
  set baseUrl(value: string | undefined) {
    this.#baseUrl = value;
    if (this.#connected && this.#source !== null) {
      this.#controller?.update(this.#source, this.#options());
    }
  }

  /** Markdown asset hook: raw reference → final URL, `null` → placeholder. */
  get transformAssetUrl(): FlvUrlTransform | undefined {
    return this.#transformAssetUrl;
  }
  set transformAssetUrl(value: FlvUrlTransform | undefined) {
    this.#transformAssetUrl = value;
    if (this.#connected && this.#source !== null) {
      this.#controller?.update(this.#source, this.#options());
    }
  }

  /** Markdown link hook: raw reference → final URL, `null` → stripped. */
  get transformLinkUrl(): FlvUrlTransform | undefined {
    return this.#transformLinkUrl;
  }
  set transformLinkUrl(value: FlvUrlTransform | undefined) {
    this.#transformLinkUrl = value;
    if (this.#connected && this.#source !== null) {
      this.#controller?.update(this.#source, this.#options());
    }
  }

  on<K extends FlvEventType>(event: K, cb: (detail: FlvEventMap[K]) => void): () => void {
    // Events also bubble as `flv:<name>` CustomEvents on this element.
    if (this.#controller) {
      return this.#controller.on(event, cb);
    }
    const handler = (ev: Event) => {
      cb((ev as CustomEvent<FlvEventMap[K]>).detail);
    };
    this.addEventListener(`flv:${event}`, handler);
    return () => {
      this.removeEventListener(`flv:${event}`, handler);
    };
  }
}

export function defineFlViewer(): void {
  if (typeof customElements !== "undefined" && !customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, FlViewerElement);
  }
}

// Auto-register when a DOM exists (SSR-safe no-op on the server).
defineFlViewer();
