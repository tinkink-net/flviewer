/**
 * Verifies the BUILT artifact (dist/) end-to-end: installs nothing, serves the
 * package over plain HTTP (raw-ESM, no bundler) and drives it in Chromium —
 * image path, lazy pdf.js chunk, blob worker, canvas output.
 *
 * Usage: node scripts/verify-dist.ts   (run `vp pack --dts` first)
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const root = "dist";
const png = readFileSync("test/fixtures/tiny.png");
const pdf = readFileSync("test/fixtures/two-page.pdf");

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/fixture.png") {
    res.setHeader("content-type", "image/png");
    res.end(png);
    return;
  }
  if (url.pathname === "/fixture.pdf") {
    res.setHeader("content-type", "application/pdf");
    res.end(pdf);
    return;
  }
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html");
    res.end(
      `<!doctype html><body style="margin:0">
        <div id="embed" style="width:500px;height:400px"></div>
        <script type="module">
          import { mount } from '/dist/index.mjs'
          const c = mount(document.getElementById('embed'), '/fixture.png')
          window.__mount = c
        </` +
        `script>
      </body>`,
    );
    return;
  }
  if (req.url?.startsWith("/dist/")) {
    try {
      const fsPath = `${root}${url.pathname.replace("/dist", "")}`;
      const body = readFileSync(fsPath);
      res.setHeader(
        "content-type",
        fsPath.endsWith(".mjs") ? "text/javascript" : "application/octet-stream",
      );
      res.end(body);
      return;
    } catch {
      res.statusCode = 404;
    }
  }
  res.statusCode = 404;
  res.end();
});

await new Promise<void>((r) => server.listen(5231, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 600 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") {
    errors.push(`[console.error] ${m.text()}`);
  }
});

let failed = false;
const check = (name: string, ok: boolean, extra?: string): void => {
  console.log(`${ok ? "✔" : "✘"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) {
    failed = true;
  }
};

await page.goto("http://localhost:5231/", { waitUntil: "load", timeout: 20000 });

// Embed surface with an image source, through dist/index.mjs.
try {
  await page.waitForFunction(
    () => document.querySelector<HTMLImageElement>("#embed img.flv-img")?.complete === true,
    null,
    { timeout: 8000 },
  );
  check("PNG via built artifact", true);
} catch {
  check("PNG via built artifact", false);
}

// Overlay + lazy PDF chunk + blob worker, through the same artifact.
const ready = await page.evaluate(async () => {
  const moduleUrl = "/dist/index.mjs";
  const { open } = (await import(moduleUrl)) as typeof import("../src/index");
  return await new Promise<
    { kind: string; pages?: number } | { error: { code: string; message: string } }
  >((resolve) => {
    const c = open("/fixture.pdf");
    c.on("ready", resolve);
    c.on("error", (d: { error: { code: string; message: string } }) => resolve({ error: d.error }));
    setTimeout(
      () => resolve({ error: { code: "timeout", message: "no ready event in 15s" } }),
      15000,
    );
  });
});
if ("kind" in ready && ready.kind === "pdf") {
  check("PDF ready event", true, `pages=${ready.pages}`);
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".flv-overlay canvas");
    if (!canvas) {
      return false;
    }
    const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!data) {
      return false;
    }
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] ?? 255) < 120) {
        return true;
      }
    }
    return false;
  });
  check("PDF canvas painted", painted === true);
} else {
  check("PDF ready event", false, JSON.stringify(ready));
}

check("no page errors / console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
