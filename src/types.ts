/** The value identifying bytes to preview. */
export type Source = string | URL | Blob | File | ArrayBuffer | Uint8Array;

export interface SourceOptions {
  /** Applied when fetching URL sources. */
  requestInit?: RequestInit;
  /** Accessible label for the preview surface. */
  title?: string;
}

export type FlvKind = "image" | "pdf" | "video" | "audio";

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
