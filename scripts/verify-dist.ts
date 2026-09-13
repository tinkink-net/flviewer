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
const docx = readFileSync("test/fixtures/minimal.docx");
const xlsx = readFileSync("test/fixtures/multi-sheet.xlsx");
const pptx = readFileSync("test/fixtures/minimal.pptx");
const md = `# Verify dist

Rendered markdown through the built artifact (ADR-6): prose + lazy
pipeline + relative asset resolution.

![dot](fixture.png)

\`\`\`js
const x = 1;
\`\`\`
`;
const txt = "hello from the dist text view\nsecond line";

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
  if (url.pathname === "/fixture.docx") {
    res.setHeader("content-type", "application/octet-stream");
    res.end(docx);
    return;
  }
  if (url.pathname === "/fixture.xlsx") {
    res.setHeader("content-type", "application/octet-stream");
    res.end(xlsx);
    return;
  }
  if (url.pathname === "/fixture.pptx") {
    res.setHeader("content-type", "application/octet-stream");
    res.end(pptx);
    return;
  }
  if (url.pathname === "/fixture.md") {
    res.setHeader("content-type", "text/markdown; charset=utf-8");
    res.end(md);
    return;
  }
  if (url.pathname === "/fixture.txt") {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(txt);
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

// Text family through the built artifact: plain text + rendered markdown
// (lazy pipeline chunk) with a relative asset.
const textChecks = await page.evaluate(async () => {
  const moduleUrl = "/dist/index.mjs";
  const { mount } = (await import(moduleUrl)) as typeof import("../src/index");
  const host = document.createElement("div");
  host.style.cssText = "width:500px;height:400px";
  document.body.append(host);

  const wait = <T>(fn: () => T | null | undefined, ms = 8000): Promise<T> =>
    new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        const v = fn();
        if (v !== null && v !== undefined) {
          resolve(v);
          return;
        }
        if (performance.now() - start > ms) {
          reject(new Error("timeout"));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });

  const out: Record<string, unknown> = {};
  const plain = mount(host, "/fixture.txt");
  const plainReady = await new Promise<{ kind: string; textKind?: string }>((resolve) => {
    plain.on("ready", resolve as never);
    plain.on("error", resolve as never);
  });
  out.plainReady = plainReady;
  out.plainPreClass =
    (await wait(() => host.querySelector("pre"), 3000).then(
      () => host.querySelector("pre")?.className ?? null,
      () => "no-pre",
    )) ?? null;
  out.plainText = (await wait(() =>
    host.querySelector<HTMLPreElement>("pre.flv-plain")?.textContent?.includes("second line")
      ? true
      : null,
  ).then(
    () => true,
    () => false,
  )) as boolean;
  plain.destroy();

  const mdHost = document.createElement("div");
  mdHost.style.cssText = "width:500px;height:400px";
  document.body.append(mdHost);
  const md = mount(mdHost, "/fixture.md");
  const mdReady = await new Promise<{
    kind: string;
    textKind?: string;
    error?: { code: string; message: string };
  }>((resolve) => {
    md.on("ready", resolve as never);
    md.on("error", (d: { error: { code: string; message: string } }) =>
      resolve({ kind: "error", error: d.error }),
    );
  });
  out.mdReady = mdReady;
  out.mdProse =
    (await wait(() => mdHost.querySelector(".flv-prose h1"), 4000).then(
      () => mdHost.querySelector(".flv-prose h1")?.textContent ?? null,
      () => null,
    )) ?? null;
  out.mdCode = Boolean(mdHost.querySelector(".flv-prose pre code.hljs"));
  out.mdImage = (await wait(() => {
    const el = mdHost.querySelector<HTMLImageElement>(".flv-prose img");
    return el?.complete && el.naturalWidth === 32 ? el : null;
  }, 4000).then(
    () => true,
    () => false,
  )) as boolean;
  const toggle = mdHost.querySelector<HTMLButtonElement>('button[aria-label="Toggle source"]');
  toggle?.click();
  out.mdSourceToggle = (await wait(() => mdHost.querySelector("pre.flv-code"), 4000).then(
    () => true,
    () => false,
  )) as boolean;
  md.destroy();
  return out;
});
check(
  "text view via built artifact",
  textChecks.plainReady === true ||
    ((textChecks.plainReady as { kind?: string }).kind === "text" && textChecks.plainText === true),
  JSON.stringify(textChecks.plainReady),
);
check(
  "markdown via built artifact (lazy pipeline + assets + toggle)",
  (textChecks.mdReady as { kind?: string }).kind === "text" &&
    textChecks.mdProse === "Verify dist" &&
    textChecks.mdCode === true &&
    textChecks.mdImage === true &&
    textChecks.mdSourceToggle === true,
  JSON.stringify(textChecks),
);
console.log(
  `  plain diagnostics: pre=${String(textChecks.plainPreClass)} text=${String(textChecks.plainText)}`,
);

// Office family (ADR-7): per-kind lazy engines through the built artifact,
// including the jszip browser build.
const officeChecks = await page.evaluate(async () => {
  const moduleUrl = "/dist/index.mjs";
  const { mount } = (await import(moduleUrl)) as typeof import("../src/index");
  const wait = <T>(fn: () => T | null | undefined, ms = 10000): Promise<T> =>
    new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = () => {
        const v = fn();
        if (v !== null && v !== undefined) {
          resolve(v);
          return;
        }
        if (performance.now() - start > ms) {
          reject(new Error("timeout"));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });

  const out: Record<string, unknown> = {};
  const hostFor = (): HTMLElement => {
    const host = document.createElement("div");
    host.style.cssText = "width:600px;height:400px";
    document.body.append(host);
    return host;
  };

  const docxHost = hostFor();
  const docxController = mount(docxHost, "/fixture.docx");
  out.docxReady = await new Promise<{ kind?: string; error?: { code: string } }>((resolve) => {
    docxController.on("ready", resolve as never);
    docxController.on("error", (d: { error: { code: string } }) => resolve({ error: d.error }));
  });
  out.docxText = (await wait(() =>
    docxHost.querySelector(".flv-docx")?.textContent?.includes("Hello flviewer DOCX") ? true : null,
  ).then(
    () => true,
    () => false,
  )) as boolean;
  docxController.destroy();

  const xlsxHost = hostFor();
  const xlsxController = mount(xlsxHost, "/fixture.xlsx");
  out.xlsxReady = await new Promise<{ kind?: string; pages?: number; error?: { code: string } }>(
    (resolve) => {
      xlsxController.on("ready", resolve as never);
      xlsxController.on("error", (d: { error: { code: string } }) => resolve({ error: d.error }));
    },
  );
  out.xlsxSelect = Boolean(xlsxHost.querySelector("select.flv-sheet-select"));
  xlsxController.destroy();

  const pptxHost = hostFor();
  const pptxController = mount(pptxHost, "/fixture.pptx");
  out.pptxReady = await new Promise<{ kind?: string; pages?: number; error?: { code: string } }>(
    (resolve) => {
      pptxController.on("ready", resolve as never);
      pptxController.on("error", (d: { error: { code: string } }) => resolve({ error: d.error }));
    },
  );
  pptxController.destroy();
  return out;
});
check(
  "docx via built artifact (lazy docx-preview + jszip browser build)",
  (officeChecks.docxReady as { kind?: string }).kind === "docx" && officeChecks.docxText === true,
  JSON.stringify(officeChecks.docxReady),
);
check(
  "xlsx via built artifact (lazy SheetJS + sheet selector)",
  (officeChecks.xlsxReady as { kind?: string }).kind === "xlsx" &&
    (officeChecks.xlsxReady as { pages?: number }).pages === 2,
  JSON.stringify(officeChecks.xlsxReady),
);
check(
  "pptx via built artifact (lazy pptx-renderer)",
  (officeChecks.pptxReady as { kind?: string }).kind === "pptx" &&
    (officeChecks.pptxReady as { pages?: number }).pages === 2,
  JSON.stringify(officeChecks.pptxReady),
);

check("no page errors / console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
