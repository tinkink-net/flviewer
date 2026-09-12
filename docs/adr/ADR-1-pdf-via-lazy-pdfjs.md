# ADR-1: PDF rendering via lazy-loaded pdf.js

## Context

v1 must render PDFs with consistent, controllable UI (our toolbar: page nav, zoom, fit) in every evergreen browser. The main alternative — native embedding via `<iframe>`/`<embed>` — renders in the browser's built-in viewer, which we cannot customize, behaves differently per browser, and is **silently broken on iOS Safari** (PDFs in iframes don't render there at all). That makes native embedding a non-starter for a cross-browser library.

The real trade-off is bundle cost: pdf.js (`pdfjs-dist`) is ~350 KB gzipped for core + worker, vs ~0 for native embed.

## Decision

Render PDFs with pdf.js, loaded via **dynamic `import()`** as a separate lazy chunk:

- Image previews never download the pdf.js chunk (main bundle stays ~12 KB gz)
- The worker is shipped **inlined inside our own lazy chunk** (generated from `pdfjs-dist/build/pdf.worker.min.mjs` by `scripts/gen-worker-source.ts`) and started from a **blob URL**: blob workers inherit the page origin, so this works for bundler-managed apps _and_ CDN-direct usage with zero consumer configuration — unlike `new Worker(new URL(...))` bundler wiring, which only covers the former
- When a real Worker can't be created (CSP without `worker-src blob:`, exotic environments), fall back to pdf.js's **fake worker** (main thread): log a warning, still render
- If the lazy chunk fails to load (offline, CSP), surface a typed `render-error` in the viewer UI — never just a console error
- Evergreen browsers are the minimum target (dynamic `import()` requirement)
- pdf.js's binary assets — Adobe **CMaps** (required to decode CJK-encoded fonts), **standard fonts** (Symbol/ZapfDingbats etc.) and **jbig2/openjpeg wasm** — are inlined into the lazy chunk too (`scripts/gen-pdf-assets.ts` → base64 archive) and served from memory via a custom `BinaryDataFactory` with `useWorkerFetch: false`. pdf.js's URL-based `cMapUrl`/`standardFontDataUrl`/`wasmUrl` options would require consumers to host files (and break CDN-direct/file:// usage), and missing CMaps render CJK PDFs with broken glyphs. ICC color management (qcms) and PDF-embedded JavaScript (quickjs) stay out: they're opt-in paths pdf.js skips gracefully

## Consequences

- We own ~350 KB gz of dependency and must track `pdfjs-dist` upgrades — the worker source and asset archive are inlined, so regeneration (`node scripts/gen-worker-source.ts && node scripts/gen-pdf-assets.ts`) is part of any upgrade
- The worker chunk is ~1.2 MB raw (minified pdf.js worker string); it only downloads on first PDF preview
- The asset archive adds ~2.2 MB raw (~700 KB gz) to the PDF lazy chunk, and is itself dynamically imported so it only downloads when a document actually requests CMap/font/wasm data; system fonts still take priority for standard-font substitution (we deliberately ship no CJK fonts — system CJK fonts fill that role)
- With `useWorkerFetch: false`, all asset bytes are fetched on the main thread and transferred to the worker; the factory must hand out fresh copies because pdf.js transfers (detaches) the buffers
- We build the PDF toolbar UX ourselves (page-at-a-time in v1, continuous scroll deferred)
- SSR is safe only as long as the library has no top-level side effects; the pdf.js import fires on first PDF interaction, client-side
