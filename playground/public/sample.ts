import { open } from "flviewer";

/** Highlights via the curated highlight.js languages (ADR-6). */
export async function preview(file: File): Promise<void> {
  const types = ["image", "pdf", "video", "audio", "text"] as const;
  for (const kind of types) {
    if (file.type.startsWith(kind)) {
      const controller = open(file, { title: file.name });
      controller.on("error", (detail) => console.error(detail.error.message));
      return;
    }
  }
  throw new Error(`unsupported: ${file.type || "unknown"}`);
}
