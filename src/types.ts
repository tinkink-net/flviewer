/** The value identifying bytes to preview. */
export type Source = string | URL | Blob | File | ArrayBuffer | Uint8Array;

export interface SourceOptions {
  /** Applied when fetching URL sources. */
  requestInit?: RequestInit;
  /** Accessible label for the preview surface. */
  title?: string;
  /** Markdown asset base: relative references resolve against it (default: the source URL). */
  baseUrl?: string;
  /** Markdown asset hook (raw reference → final URL; `null` → placeholder). */
  transformAssetUrl?: FlvUrlTransform;
  /** Markdown link hook (raw reference → final URL; `null` → link stripped). */
  transformLinkUrl?: FlvUrlTransform;
}

export type FlvKind = "image" | "pdf" | "video" | "audio" | "text";

/** Text-family sub-kind (see CONTEXT.md "Sub-kind"). */
export type FlvTextKind = "plain" | "code" | "markdown" | "json" | "csv" | "xml";

/** Raw Markdown asset/link reference → final URL (`null` → placeholder/stripped). */
export type FlvUrlTransform = (url: string) => string | null;

export type FlvErrorCode =
  | "fetch-error"
  | "unsupported-type"
  | "encrypted-pdf"
  | "render-error"
  | "aborted";

export interface FlvError {
  code: FlvErrorCode;
  message: string;
  cause?: unknown;
}

export interface FlvReadyDetail {
  kind: FlvKind;
  /** Page count, PDF only. */
  pages?: number;
  name?: string;
  /** Text-family sub-kind, text only. */
  textKind?: FlvTextKind;
}

export interface FlvTruncatedDetail {
  /** Bytes kept (after the truncation caps were applied). */
  bytes: number;
  /** Lines kept. */
  lines: number;
}

export interface FlvErrorDetail {
  error: FlvError;
}

export interface FlvCloseDetail {
  /** Programmatic close or user close. */
  by: "user" | "api";
}

export interface FlvPageDetail {
  page: number;
  total: number;
}

export interface FlvZoomDetail {
  /** Current magnification relative to fit size. */
  scale: number;
}

export interface FlvEventMap {
  ready: FlvReadyDetail;
  error: FlvErrorDetail;
  close: FlvCloseDetail;
  pagechange: FlvPageDetail;
  zoom: FlvZoomDetail;
  truncated: FlvTruncatedDetail;
}

export type FlvEventType = keyof FlvEventMap;

export interface FlvController {
  /** Swap the source, reusing the same instance. */
  update(source: Source, options?: SourceOptions): void;
  /** Idempotent teardown: removes DOM, listeners, revokes blob URLs. */
  destroy(): void;
  on<K extends FlvEventType>(event: K, cb: (detail: FlvEventMap[K]) => void): () => void;
  /** Overlay only: closes the modal (no-op for Embed). */
  close(): void;
}
