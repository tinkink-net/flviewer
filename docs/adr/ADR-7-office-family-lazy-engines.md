# ADR-7: Office family (DOCX / XLSX / PPTX) via per-kind lazy engines

## Context

Phases 3–4 of the format roadmap (#3 DOCX & XLSX, #8 PPTX) bring the first real
third-party rendering engines and the first ZIP-container formats. The two phases were
planned as one family (single PR, phase-split commits) because they share detection
(OOXML container sniff, CFB ambiguity) and toolbar mechanics (pager slots).

Constraints inherited from the existing architecture: typed errors only (ADR-4), `flv-`
light-DOM namespace (ADR-3), lazy engine chunks with zero eager bundle cost (ADR-1
pattern), and the Fit/interaction-mode machinery (CONTEXT.md). Office sources always
fetch-to-blob — Range streaming stays media-only.

## Decision

**Delivery topology.** One combined PR closing #3 and #8; commits split per phase; PPTX
work fronts the branch since it carries the most engine risk.

**Kind model.** `docx`, `xlsx`, `pptx` enter `FlvKind` as **three first-class kinds** —
no `office` umbrella kind, no sub-kind. The text-family Sub-kind pattern was considered
and rejected: kind dispatch in views/toolbar stays one `switch` wide, and `ready.kind`
names the format directly. Toolbar control groups enumerate kinds explicitly (pager:
pdf/xlsx/pptx; rotate stays images/pdf; xlsx hides the mode/transform groups — see XLSX
below).

**Detection — zip-free container sniff.** `detectKind` stays a pure **synchronous**
function.

- `DetectInput` gains an optional `tail` slice (last 64 KB). `loadSource` always holds
  the full blob in memory before detection, so this is additive, not architectural.
- Bare `PK\x03\x04` bytes with no MIME/extension claim → **central-directory scan**: the
  EOCD record and entry _names_ (`word/…`, `xl/…`, `ppt/…`) are raw in the header bytes —
  no decompression, no zip dependency. MIME claims resolve directly (Content-Type is
  trusted like `application/pdf`); extension claims are verified against the container
  magic (a PDF renamed `.docx` stays a PDF; junk under an OOXML name stays unsupported).
- `D0 CF 11 E0` (CFB) is ambiguous by magic: legacy binary Office _and_ encrypted OOXML.
  A **minimal CFB directory walk** (header → first directory sector → FAT chain →
  UTF-16LE stream names) resolves it authoritatively regardless of file naming:
  `EncryptedPackage`/`EncryptionInfo` → `encrypted-office`; `WordDocument` / `Workbook` /
  `PowerPoint Document` → `unsupported-type` with an explicit legacy-format message.
  Extension-only heuristics were rejected — a legacy `.doc` renamed `.docx` must not be
  mislabeled encrypted, and unnamed blobs deserve a precise error.
- **fflate dissolves from the plan entirely.** The issues sketched a shared fflate ZIP
  layer; header scanning removes it from detection, and every engine carries its own zip
  handling anyway (docx-preview → JSZip, SheetJS → self-contained, pptx-renderer →
  JSZip). The duplication is accepted: all of it lives in lazy chunks.

**Error codes.** Additive `encrypted-office` alongside `encrypted-pdf`; both are
detected at detection time, never mid-render. Consolidating into a single generic
`encrypted` code was considered and rejected for v1 compatibility — revisit if a 1.0
cleanup happens. Legacy `.doc`/`.xls`/`.ppt` map to `unsupported-type`, never silently.

**DOCX — `docx-preview`.** Chosen over `mammoth` (semantic HTML): fidelity is the
office-preview promise, and its fixed-size page boxes slot into the existing
transform-based PanZoom model exactly like PDF pages. Mammoth's flow-HTML model would
fork family interaction semantics (scroll vs pan) and drop page layout/styling. Rendered
as **continuous stacked pages — no pager** (pager slots belong to xlsx sheets and pptx
slides); fit/100%/zoom and select/hand modes work as for PDF. DOCX pagination is
marker-based: pages split at explicit `w:br` page breaks, section breaks and Word's
saved `lastRenderedPageBreak` hints. Documents written programmatically carry no such
markers and render as one continuous flow — client-side reflow pagination (recomputing
line breaks like a word processor) is out of scope by design. docx-preview builds DOM
via its own XML parser (no raw-HTML sink), so no DOMPurify pass — which also keeps the
text-pipeline chunk out of docx previews. Its shipped stylesheet is re-scoped under the
`flv-` namespace (ADR-3) — accepted integration work.

**XLSX — SheetJS CE + DOM table.**

- SheetJS pinned from the **npm registry** (0.18.5 — the registry froze in 2022; current
  releases ship via the vendor CDN). The stale-version/CVE exposure is an accepted
  trade-off for registry-clean provenance, recorded with a revisit trigger: any security
  advisory against 0.18.5 moves us to the pinned CDN tarball.
- The sheet renders via **DOM APIs from SheetJS cell objects** (honoring `.w` formatted
  text — covers best-effort number/date formatting and cached formula values), styled by
  the existing CSV table CSS (sticky header). `sheet_to_html` + DOMPurify was rejected:
  the sanitize pass would drag the text-pipeline chunk into xlsx previews, breaking
  lazy-chunk isolation.
- **Native scroll, like the text family** — no PanZoom. `position: sticky` dies inside
  any transformed ancestor, so zoom machinery and the sticky header are mutually
  exclusive; the header wins (a spreadsheet is navigated by scroll, and cell selection
  stays native). Deviation from the issue's "zoom applies to rendered content",
  recorded in #3.
- Sheet switching rides the pager slots: prev/next arrows + the indicator upgraded to a
  `<select>` dropdown (long/multibyte sheet names); `nextPage`/`prevPage` keep the
  keyboard contract; `pagechange` fires on switch; `ready.pages` = sheet count.
- **Cell cap: 50 000 cells per sheet**, enforced during the build loop; overflow shows
  the truncation notice + download hint and fires `truncated` with an additive optional
  `cells` field in the detail (kept amounts, mirroring bytes/lines).

**PPTX — `@aiden0z/pptx-renderer`, adopted unconditionally.** The landscape was vetted:

- `pptx-preview` (hit757): **disqualified** — closed source (source paid on request,
  redistribution forbidden), `echarts`+`lodash` deps, unauditable and unpatchable.
- `pptx-viewer-core`: over-scoped (parse+edit+serialize+convert), 22.8 MB unpacked.
- `pptxviewjs`: AI-code-smell publisher, single maintainer, skip.
- `@aiden0z/pptx-renderer`: Apache-2.0, TypeScript-first, active, Playwright +
  pixelmatch visual tests, size-limit enforced, high download traction; deps JSZip +
  echarts with an optional pdfjs-dist peer (already satisfied).

Hand-rolling was the runner-up (full control, ~600–1000 lines, low fidelity ceiling);
the lib's maintained fidelity and test discipline won. Slides map to the pager
(`hasPages`, prev/next, `pagechange`); parse/render failure → typed `render-error`.
Known fidelity gaps declared: animations/transitions, embedded media, speaker notes,
legacy `.ppt`. **echarts chunk weight is a monitored item at the `vp pack` release
gate** (bundle-size expectations documented), not an adoption gate — if it dominates
the chunk, splitting or gating it becomes a tracked follow-up.

**Chunk topology.** One lazy chunk per kind (separate dynamic imports per engine; the
bundler splits shared modules automatically). Image, PDF and text previews load none of
them — verified by the per-phase isolation criteria.

**Packaging (raw-ESM purity).** The engines bundle into their chunks (`pack.deps`
alwaysBundle list), with two browser-purity measures discovered at the release gate:

- `platform: "browser"` (with `.mjs`/`.d.mts` output extensions preserved) — SheetJS's
  guarded `require("fs")` shims otherwise drag a `createRequire` interop (`node:module`)
  into the shared runtime chunk, breaking raw-ESM contexts.
- `jszip` aliases to its self-contained browser build (`jszip/dist/jszip.min.js`) — its
  CJS build pulls a readable-stream/process polyfill chain.

**Release-gate chunk sizes (recorded at Phase 3+4 implementation):** pptx chunk
477 KB gz (echarts included — the monitored item; acceptable, split/gating becomes a
follow-up only if it grows); xlsx 171 KB gz; docx-preview 25 KB gz + shared jszip
31 KB gz.

## Consequences

- `FlvKind` grows three values; `DetectResult` mirrors them plus `encrypted-office`;
  `FlvErrorCode` grows `encrypted-office`; `FlvTruncatedDetail` becomes optional-field
  (`bytes`/`lines`/`cells`, kept amounts); `DetectInput` grows the `tail` slice. All
  additive.
- The engines are bundled with `platform: "browser"` and jszip resolved to its browser
  build (see Packaging) — the dist artifact stays browser-pure for raw-ESM contexts.
- echarts ships inside the pptx chunk even when no chart is rendered (477 KB gz
  measured); visible at the release gate and documented there.
- SheetJS 0.18.5 is a known-stale pin with a defined escalation path (CDN tarball).
- Sticky-header-over-zoom sets a precedent: flow-rendered kinds prefer native scroll;
  fixed-size kinds (pdf/docx/pptx) get PanZoom. Future formats should declare which
  world they live in before choosing a renderer.
