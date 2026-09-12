import { detectKind } from "./detect";
import { createFlvError, FlvAbortError, isAbortError } from "./errors";
import type { FlvKind, Source } from "./types";

export interface LoadedSource {
  blob: Blob;
  kind: FlvKind;
  /** Filename for display/download, when derivable. */
  name?: string;
}

export type ProgressCallback = (loaded: number, total: number | null) => void;

const HEAD_BYTES = 64;

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
  const sub = mime.replace("image/", "").split(";")[0]?.trim();
  const table: Record<string, string> = {
    jpeg: "jpg",
    "svg+xml": "svg",
    "vnd.microsoft.icon": "ico",
    "x-icon": "ico",
  };
  if (!sub) {
    return "img";
  }
  return table[sub] ?? (sub.includes("/") ? "img" : sub);
}

export function suggestFilename(loaded: LoadedSource): string {
  const name = loaded.name?.trim();
  if (name && /\.[a-z0-9]{1,8}$/i.test(name)) {
    return name;
  }
  const base = name && name.trim() ? name.trim() : "download";
  return `${base}.${extensionForKind(loaded.kind, loaded.blob.type || "")}`;
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

async function headBytes(blob: Blob): Promise<Uint8Array> {
  const sliced = blob.slice(0, HEAD_BYTES);
  const buf = await sliced.arrayBuffer();
  return new Uint8Array(buf);
}

export async function loadSource(
  source: Source,
  options?: { requestInit?: RequestInit; signal?: AbortSignal; onProgress?: ProgressCallback },
): Promise<LoadedSource> {
  const signal = options?.signal;
  const onProgress = options?.onProgress ?? (() => {});
  let blob: Blob;
  let name: string | undefined;

  if (typeof source === "string" || source instanceof URL) {
    const url = typeof source === "string" ? source : source.href;
    let response: Response;
    try {
      response = await fetch(url, {
        ...options?.requestInit,
        signal: options?.requestInit?.signal ?? signal,
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
    name = nameFromUrl(url);
    blob = await blobFromResponse(response, signal, onProgress);
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

  const bytes = await headBytes(blob);
  const kind = detectKind({
    mime: blob.type,
    name,
    bytes,
  });
  if (kind === "unsupported") {
    const err = createFlvError(
      "unsupported-type",
      blob.type
        ? `This file type is not supported (received "${blob.type}").`
        : "This file type is not supported.",
    );
    throw err;
  }
  return { blob, kind, name };
}
