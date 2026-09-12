import { open, mount } from "../src/index";
import type { FlViewerElement } from "../src/index";
import pngUrl from "../test/fixtures/tiny.png?url";
import jpgUrl from "../test/fixtures/tiny.jpg?url";
import pdfUrl from "../test/fixtures/two-page.pdf?url";

const wc = document.querySelector<FlViewerElement>("#wc")!;

wc.on("ready", (detail) => console.log("[fl-viewer] ready", detail));
wc.on("error", (detail) => console.error("[fl-viewer] error", detail));

let embedController = mount(document.querySelector("#embed-1")!, jpgUrl);
embedController.on("ready", (detail) => console.log("[embed] ready", detail));

document.addEventListener("click", async (ev) => {
  const btn = (ev.target as HTMLElement).closest("[data-demo]");
  if (!btn) return;
  const demo = btn.getAttribute("data-demo");
  switch (demo) {
    case "open-png":
      open(pngUrl, { title: "tiny.png" });
      break;
    case "open-jpg":
      open(jpgUrl);
      break;
    case "open-pdf":
      open(pdfUrl, { title: "two-page.pdf" });
      break;
    case "open-url":
      open(new URL(pngUrl, location.href));
      break;
    case "open-broken":
      open(new Blob(["hello"], { type: "text/plain" }));
      break;
    case "mount-pdf":
      embedController.update(pdfUrl);
      break;
    case "mount-png":
      embedController.update(pngUrl);
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
  }
});
