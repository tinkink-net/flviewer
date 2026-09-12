import type { FlvError, FlvErrorCode } from "./types";

const DEFAULT_MESSAGES: Record<FlvErrorCode, string> = {
  "fetch-error": "The file could not be downloaded.",
  "unsupported-type": "This file type is not supported.",
  "encrypted-pdf": "This PDF is password protected.",
  "render-error": "The file could not be rendered.",
  aborted: "The operation was aborted.",
};

export function createFlvError(code: FlvErrorCode, message?: string, cause?: unknown): FlvError {
  const err: FlvError = {
    code,
    message: message ?? DEFAULT_MESSAGES[code],
  };
  if (cause !== undefined) {
    err.cause = cause;
  }
  return err;
}

/** pdf.js rejects encrypted documents with a `PasswordException`. */
export function isPasswordException(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "PasswordException"
  );
}

export class FlvAbortError extends Error {
  readonly flvCode = "aborted" as const;
  constructor() {
    super("aborted");
    this.name = "FlvAbortError";
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof FlvAbortError || (err instanceof DOMException && err.name === "AbortError");
}
