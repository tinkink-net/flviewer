import { open, mount } from "../src/index";
import type { FlViewerElement } from "../src/index";
import docxUrl from "../test/fixtures/minimal.docx?url";
import jpgUrl from "../test/fixtures/tiny.jpg?url";
import mp3Url from "../test/fixtures/tiny.mp3?url";
import mp4Url from "../test/fixtures/tiny.mp4?url";
import pdfUrl from "../test/fixtures/two-page.pdf?url";
import pngUrl from "../test/fixtures/tiny.png?url";
import pptxUrl from "../test/fixtures/minimal.pptx?url";
import webmUrl from "../test/fixtures/tiny.webm?url";
import xlsxUrl from "../test/fixtures/multi-sheet.xlsx?url";

const wc = document.querySelector<FlViewerElement>("#wc")!;

// Text-family fixtures are served from public/ so relative asset references
// inside sample.md resolve to stable URLs.
const sample = (name: string): string => new URL(`/sample.${name}`, location.href).href;

// Markdown asset hook demo: rewrite every asset reference (ADR-6).
const hookOptions = {
  title: "sample.md (transformAssetUrl hook)",
  transformAssetUrl: (url: string) => (url.includes("tiny.png") ? `${url}?via-hook=1` : url),
};

// Custom file picker: selected file becomes a Blob source, kind is auto-detected.
let customFile: File | null = null;
const customInput = document.querySelector<HTMLInputElement>("#custom-file")!;
const customBtns = document.querySelectorAll<HTMLButtonElement>('[data-demo^="custom-"]');
customInput.addEventListener("change", () => {
  customFile = customInput.files?.[0] ?? null;
  for (const btn of customBtns) {
    btn.disabled = !customFile;
  }
});

wc.on("ready", (detail) => console.log("[fl-viewer] ready", detail));
wc.on("error", (detail) => console.error("[fl-viewer] error", detail));
wc.on("truncated", (detail) => console.warn("[fl-viewer] truncated", detail));

let embedController = mount(document.querySelector("#embed-1")!, jpgUrl);
embedController.on("ready", (detail) => console.log("[embed] ready", detail));

document.addEventListener("click", async (ev) => {
  const btn = (ev.target as HTMLElement).closest("[data-demo]");
  if (!btn) return;
  const demo = btn.getAttribute("data-demo");
  switch (demo) {
    case "custom-open":
      if (customFile) open(customFile, { title: customFile.name });
      break;
    case "custom-mount":
      if (customFile) embedController.update(customFile);
      break;
    case "open-png":
      open(pngUrl, { title: "tiny.png" });
      break;
    case "open-jpg":
      open(jpgUrl);
      break;
    case "open-pdf":
      open(pdfUrl, { title: "two-page.pdf" });
      break;
    case "open-docx":
      open(docxUrl, { title: "minimal.docx" });
      break;
    case "open-xlsx":
      open(xlsxUrl, { title: "multi-sheet.xlsx" });
      break;
    case "open-pptx":
      open(pptxUrl, { title: "minimal.pptx" });
      break;
    case "open-mp4":
      open(mp4Url, { title: "tiny.mp4" });
      break;
    case "open-webm":
      open(webmUrl, { title: "tiny.webm" });
      break;
    case "open-mp3":
      open(mp3Url, { title: "tiny.mp3" });
      break;
    case "open-txt":
      open(sample("txt"), { title: "sample.txt" });
      break;
    case "open-code":
      open(sample("ts"), { title: "sample.ts" });
      break;
    case "open-json":
      open(sample("json"), { title: "sample.json" });
      break;
    case "open-csv":
      open(sample("csv"), { title: "sample.csv" });
      break;
    case "open-xml":
      open(sample("xml"), { title: "sample.xml" });
      break;
    case "open-md":
      open(sample("md"), { title: "sample.md" });
      break;
    case "open-md-hook":
      open(sample("md"), hookOptions);
      break;
    case "open-md-blob": {
      const text = await (await fetch(sample("md"))).text();
      // In-memory source: no base URL — relative assets degrade to placeholders.
      open(new Blob([text], { type: "text/markdown" }), { title: "sample.md (blob)" });
      break;
    }
    case "open-url":
      open(new URL(pngUrl, location.href));
      break;
    case "open-remote":
      // Remote image for on-device WeChat checks: flviewer keeps the original
      // URL in the <img>, so WeChat's native save/forward menu can use it.
      open("https://picsum.photos/seed/flviewer/1200/800", { title: "remote.jpg" });
      break;
    case "open-broken":
      // Invalid UTF-8 with no known magic — genuinely unsupported.
      open(
        new Blob([new Uint8Array([0x80, 0x81, 0x82, 0x83])], { type: "application/octet-stream" }),
      );
      break;
    case "mount-pdf":
      embedController.update(pdfUrl);
      break;
    case "mount-docx":
      embedController.update(docxUrl);
      break;
    case "mount-xlsx":
      embedController.update(xlsxUrl);
      break;
    case "mount-pptx":
      embedController.update(pptxUrl);
      break;
    case "mount-png":
      embedController.update(pngUrl);
      break;
    case "mount-mp4":
      embedController.update(mp4Url);
      break;
    case "mount-md":
      embedController.update(sample("md"));
      break;
    case "swap":
      embedController.update(jpgUrl);
      break;
    case "wc-pdf":
      wc.source = pdfUrl;
      break;
    case "wc-png":
      wc.source = pngUrl;
      break;
    case "wc-mp4":
      wc.source = mp4Url;
      break;
    case "wc-md":
      wc.source = sample("md");
      break;
  }
});
