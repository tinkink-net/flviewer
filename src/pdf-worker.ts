/**
 * Starts the pdf.js worker from an inlined source string via a blob URL.
 * Blob workers inherit the page origin, so this works for bundled apps and
 * CDN-direct usage alike — no consumer configuration required.
 * If the Worker cannot be created (e.g. restrictive CSP), pdf.js falls back
 * to its main-thread "fake worker" mode.
 */
export function createBlobWorker(workerSource: string): Worker {
  const blob = new Blob([workerSource], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    return new Worker(url, { type: "module" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
