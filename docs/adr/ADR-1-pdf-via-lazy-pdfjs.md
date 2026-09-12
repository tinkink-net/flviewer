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

## Consequences

- We own ~350 KB gz of dependency and must track `pdfjs-dist` upgrades — the worker source is inlined, so regeneration (`node scripts/gen-worker-source.ts`) is part of any upgrade
- The worker chunk is ~1.2 MB raw (minified pdf.js worker string); it only downloads on first PDF preview
- We build the PDF toolbar UX ourselves (page-at-a-time in v1, continuous scroll deferred)
- SSR is safe only as long as the library has no top-level side effects; the pdf.js import fires on first PDF interaction, client-side
