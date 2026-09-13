import {
  AUDIO_EXTENSIONS,
  detectKind,
  extensionOf,
  isLegacyOfficeFormat,
  textSubKindOf,
  VIDEO_EXTENSIONS,
} from "./detect";
import { createFlvError, FlvAbortError, isAbortError } from "./errors";
import type { FlvKind, FlvTextKind, Source } from "./types";

export interface LoadedSource {
  /** Full payload. Absent for streaming media sources (played from `url`). */
  blob?: Blob;
  kind: FlvKind;
  /** Filename for display/download, when derivable. */
  name?: string;
  /** The source URL — media streams from it; markdown assets base on it (ADR-6). */
  url?: string;
  /** Content-Type when known without a payload (streaming sources). */
  mime?: string;
  /** Text-family sub-kind, text only. */
  textKind?: FlvTextKind;
}

export type ProgressCallback = (loaded: number, total: number | null) => void;

const HEAD_BYTES = 64;
const SNIFF_RANGE = "bytes=0-63";
/** Detection slices (ADR-7): CFB directory and ZIP central-directory sniffs. */
const DETECT_HEAD_BYTES = 65536;
const DETECT_TAIL_BYTES = 65536;

function nameFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0] ?? "";
  const last = path.split("/").filter(Boolean).pop();
  try {
    return decodeURIComponent(last ?? "");
  } catch {
    return last ?? "";
  }
}

function extensionForKind(kind: FlvKind, mime: string): string {
  if (kind === "pdf") {
    return "pdf";
  }
  if (kind === "docx" || kind === "xlsx" || kind === "pptx") {
    return kind;
  }
  if (kind === "text") {
    const sub = (mime.split(";")[0] ?? "").trim().replace(/^text\//, "");
    const table: Record<string, string> = {
      markdown: "md",
      "tab-separated-values": "tsv",
      javascript: "js",
      html: "html",
      css: "css",
      json: "json",
      csv: "csv",
      xml: "xml",
      plain: "txt",
    };
    return table[sub] ?? "txt";
  }
  const fallback = kind === "video" ? "vid" : kind === "audio" ? "aud" : "img";
  const table: Record<string, string> = {
    jpeg: "jpg",
    "svg+xml": "svg",
    "vnd.microsoft.icon": "ico",
    "x-icon": "ico",
    // video
    quicktime: "mov",
    "x-matroska": "mkv",
    // audio
    "x-wav": "wav",
    wave: "wav",
    aac: "aac",
    flac: "flac",
    opus: "opus",
    mp3: "mp3",
    // ambiguous subs
    ...(kind === "video" ? { mpeg: "mpg", ogg: "ogv", mp4: "mp4", webm: "webm" } : null),
    ...(kind === "audio" ? { mp4: "m4a", webm: "weba", ogg: "ogg", mpeg: "mp3" } : null),
  };
  const sub = (mime.split(";")[0] ?? "").trim().replace(/^(image|video|audio)\//, "");
  if (!sub) {
    return fallback;
  }
  return table[sub] ?? (sub.includes("/") ? fallback : sub);
}

export function suggestFilename(loaded: LoadedSource): string {
  const name = loaded.name?.trim();
  if (name && /\.[a-z0-9]{1,8}$/i.test(name)) {
    return name;
  }
  const base = name && name.trim() ? name.trim() : "download";
  return `${base}.${extensionForKind(loaded.kind, loaded.mime ?? loaded.blob?.type ?? "")}`;
}

async function blobFromResponse(
  response: Response,
  signal: AbortSignal | undefined,
  onProgress: ProgressCallback,
): Promise<Blob> {
  const totalHeader = response.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body) {
    const blob = await response.blob();
    onProgress(blob.size, blob.size);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (signal?.aborted) {
      void reader.cancel().catch(() => {});
      throw new FlvAbortError();
    }
    if (done) {
      break;
    }
    if (value) {
      // Copy into a plain ArrayBuffer-backed buffer (Blob-safe, detached-safe).
      chunks.push(new Uint8Array(value));
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }
  return new Blob(chunks, { type: contentType });
}

/** Head + tail slices for the office container sniffs (ADR-7). */
async function detectSlices(
  blob: Blob,
): Promise<{ bytes: Uint8Array; tail?: { bytes: Uint8Array; fileOffset: number } }> {
  const bytes = new Uint8Array(await blob.slice(0, DETECT_HEAD_BYTES).arrayBuffer());
  if (blob.size <= DETECT_HEAD_BYTES) {
    return { bytes };
  }
  const fileOffset = Math.max(0, blob.size - DETECT_TAIL_BYTES);
  const tailBytes = new Uint8Array(await blob.slice(fileOffset).arrayBuffer());
  return { bytes, tail: { bytes: tailBytes, fileOffset } };
}

async function fetchResponse(
  url: string,
  requestInit: RequestInit | undefined,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      signal: requestInit?.signal ?? signal,
    });
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      throw new FlvAbortError();
    }
    throw createFlvError("fetch-error", undefined, err);
  }
  if (!response.ok) {
    throw createFlvError(
      "fetch-error",
      `The file could not be downloaded (HTTP ${response.status}).`,
    );
  }
  return response;
}

/**
 * True when requestInit carries nothing a `<video>/<audio src>` element
 * cannot reproduce. Custom headers, methods or credentials modes force the
 * fetch-to-blob path, because native media elements cannot attach them.
 */
function isStreamableRequestInit(requestInit?: RequestInit): boolean {
  if (!requestInit) {
    return true;
  }
  return (
    requestInit.method === undefined &&
    requestInit.body === undefined &&
    requestInit.headers === undefined &&
    requestInit.credentials === undefined &&
    requestInit.integrity === undefined &&
    requestInit.mode === undefined &&
    requestInit.referrer === undefined &&
    requestInit.cache === undefined &&
    requestInit.redirect === undefined
  );
}

type SniffResult =
  | { action: "stream"; loaded: LoadedSource }
  | { action: "use"; blob: Blob }
  | { action: "full" };

/**
 * Streaming decision for URL sources (see the Phase-1 design note):
 * a ranged GET (Range: bytes=0-63) sniffs Content-Type + magic bytes so that
 * HTTP failures still surface as `fetch-error` and detection keeps its
 * MIME → extension → magic order. A 206 response for a video/audio kind is
 * played directly from the URL (Range-request seeking, no full download);
 * anything else falls through to the regular full fetch.
 */
async function sniffUrlSource(
  url: string,
  name: string,
  requestInit: RequestInit | undefined,
  signal: AbortSignal | undefined,
): Promise<SniffResult> {
  const headers = new Headers(requestInit?.headers);
  headers.set("Range", SNIFF_RANGE);
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      headers,
      signal: requestInit?.signal ?? signal,
    });
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      throw new FlvAbortError();
    }
    throw createFlvError("fetch-error", undefined, err);
  }
  if (!response.ok) {
    if (response.status === 416) {
      // Server rejects ranges — fall back to a plain full request.
      void response.body?.cancel().catch(() => {});
      return { action: "full" };
    }
    throw createFlvError(
      "fetch-error",
      `The file could not be downloaded (HTTP ${response.status}).`,
    );
  }
  if (response.status !== 206) {
    // Range ignored (200): the body is the whole file — use it as-is.
    const blob = await blobFromResponse(response, signal, () => {});
    return { action: "use", blob };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      throw new FlvAbortError();
    }
    throw createFlvError("fetch-error", "The file could not be downloaded.", err);
  }
  const kind = detectKind({
    mime: response.headers.get("content-type"),
    name,
    bytes: bytes.slice(0, HEAD_BYTES),
  });
  if (kind === "video" || kind === "audio") {
    return {
      action: "stream",
      loaded: {
        kind,
        name,
        url,
        mime: response.headers.get("content-type") ?? undefined,
      },
    };
  }
  // Non-media kind: only the head was fetched — download in full.
  void response.body?.cancel().catch(() => {});
  return { action: "full" };
}

export async function loadSource(
  source: Source,
  options?: { requestInit?: RequestInit; signal?: AbortSignal; onProgress?: ProgressCallback },
): Promise<LoadedSource> {
  const signal = options?.signal;
  const onProgress = options?.onProgress ?? (() => {});
  let blob: Blob | undefined;
  let name: string | undefined;
  let sourceUrl: string | undefined;

  if (typeof source === "string" || source instanceof URL) {
    const url = typeof source === "string" ? source : source.href;
    sourceUrl = url;
    name = nameFromUrl(url);
    const ext = extensionOf(name);
    const sniffable =
      isStreamableRequestInit(options?.requestInit) &&
      (ext === "" || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext));
    if (sniffable) {
      const sniffed = await sniffUrlSource(url, name, options?.requestInit, signal);
      if (sniffed.action === "stream") {
        return sniffed.loaded;
      }
      if (sniffed.action === "use") {
        blob = sniffed.blob;
      }
    }
    if (!blob) {
      const response = await fetchResponse(url, options?.requestInit, signal);
      blob = await blobFromResponse(response, signal, onProgress);
    }
  } else if (source instanceof Blob) {
    blob = source;
    if (source instanceof File) {
      name = source.name;
    }
    onProgress(blob.size, blob.size);
  } else if (source instanceof ArrayBuffer) {
    blob = new Blob([source]);
    onProgress(blob.size, blob.size);
  } else if (source instanceof Uint8Array) {
    // Copy: integrator buffers are frequently reused.
    blob = new Blob([new Uint8Array(source)]);
    onProgress(blob.size, blob.size);
  } else {
    throw createFlvError("unsupported-type");
  }

  const { bytes, tail } = await detectSlices(blob);
  const kind = detectKind({
    mime: blob.type,
    name,
    bytes,
    tail,
  });
  if (kind === "encrypted-office") {
    throw createFlvError("encrypted-office");
  }
  if (kind === "unsupported") {
    const message = isLegacyOfficeFormat({ mime: blob.type, name })
      ? "Legacy binary Office formats (.doc, .xls, .ppt) are not supported."
      : blob.type
        ? `This file type is not supported (received "${blob.type}").`
        : "This file type is not supported.";
    throw createFlvError("unsupported-type", message);
  }
  return {
    blob,
    kind,
    name,
    // URL sources keep their URL: the markdown asset base resolves
    // against it (ADR-6). Streaming media carries it in the same field.
    ...(sourceUrl ? { url: sourceUrl } : null),
    ...(kind === "text" ? { textKind: textSubKindOf({ mime: blob.type, name }) ?? "plain" } : null),
  };
}
