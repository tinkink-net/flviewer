# ADR-6: Rendered Markdown via a lazy text pipeline

## Context

Phase 2 of the format roadmap (#2) adds the text family. Plain text/code/JSON/CSV/XML are
straightforward decode-and-render, but Markdown is specified to render as **HTML, not raw
text** — which brings an untrusted-HTML surface (XSS is a hard requirement for URL-sourced
files) and an asset-resolution problem (`<img>`/link references inside the document).

The Core fetches URL sources itself (`requestInit`, progress, typed `fetch-error`), and
blob-URL lifecycle is managed by the view. Anything we render from parsed Markdown must fit
that security and lifecycle model, stay inside the `flv-` namespace (ADR-3), and add **zero
eager bundle cost** (ADR-1 pattern).

## Decision

**Pipeline (one lazy chunk, loaded on first text view):**

- `marked` — CommonMark-solid parser, small, zero deps
- `DOMPurify` — battle-tested sanitizer (self-written allow-lists are an XSS liability)
- `highlight.js` — **core build + ~20 curated languages** (~30 KB gz vs ~90 KB gz for
  `lib/common`); Shiki rejected (TextMate grammars + wasm = MBs, wrong shape for a viewer)

Loaded via dynamic `import()`; image/PDF previews never download it. All three are
`pack.noExternal` so the dist artifact works in bundler-managed, CDN-direct and raw-ESM
contexts (same rule as pdf.js).

**Sanitizer posture (DOMPurify, explicit allow-list):**

- An explicit `ALLOWED_TAGS`/`ALLOWED_ATTR` allow-list — `USE_PROFILES` is
  avoided because it silently ignores `FORBID_TAGS`/`FORBID_ATTR`
- No active content: no `script`, `style` tag/attribute (prose CSS must not
  escape the prose box), no `iframe`/`form`/`object`/`embed`/`base`, no
  in-prose `audio`/`video` (GitHub-style degradation), no `srcset` (would
  bypass the URL transform hook)
- DOMPurify defaults handle `on*` handlers and `javascript:` URIs;
  `data:` images are kept (`ADD_DATA_URI_TAGS`) for inline diagrams
- Any `flv-`/`flv:` class token in the sanitized tree is scrubbed — author
  HTML must not spoof the viewer's own chrome (CONTEXT.md namespace rule)

**Asset & link URL policy (per-reference resolution order):**

1. `transformAssetUrl` / `transformLinkUrl` hook, if set — receives the raw md-authored
   reference; returns the final URL, or `null` (asset → placeholder, link → stripped text)
2. Otherwise: absolute URL → used as-is; relative → resolved against the `baseUrl` option,
   else the source URL (URL sources); neither → placeholder / stripped
3. Plain `<img>` rendering (CORS-exempt) — **`requestInit` headers intentionally do not
   apply to assets/links**; the transform hook (signed/proxied URLs) is the escape hatch.
   Recorded limitation; a fetch-through opt-in is a possible future addition
4. Prose images always get `loading="lazy"` + `referrerPolicy="no-referrer"`; a per-`<img>`
   `error` listener swaps in the styled placeholder (uniform UX for 404s, blocked hosts and
   baseless in-memory sources — graceful degradation, never a typed error)
5. Links: non-fragment → `target="_blank"` + `rel="noopener noreferrer"` (never navigate
   the embedding page); `#fragment` → in-view smooth scroll to the heading id

**Source toggle:** a markdown-only toolbar button (`aria-pressed`, view-local state,
resets to rendered on every new source) flips the stage between rendered prose and the raw
source highlighted as code.

**Non-markdown text family:** native-scroll views (no PanZoom; mode + transform toolbar
groups hidden, native text selection always on). JSON pretty-prints only when
`JSON.parse` succeeds (else code view, not an error); CSV gets a self-written RFC-4180
parser (quoted commas/newlines) → sticky-header table. Detection: `"text"` kind with a
sub-kind (`plain`/`code`/`markdown`/`json`/`csv`/`xml`) refined via specific MIME →
extension → generic `text/*`, guarded by the UTF-8-fatal/NUL sniff and ordered **before**
magic bytes — but a known binary signature (e.g. `%PDF-` served as `text/plain`) still
wins over the text claim. Guard: 2 MB / 10 000 lines — an in-view truncated notice +
download hint, and a `truncated` event (`{ bytes, lines }`, kept amounts); truncation is
an event, not an error.

## Consequences

- The lazy chunk (~100–150 KB gz incl. hljs languages) downloads only on first text view
- The sanitizer allow-list is the security boundary — any future markdown feature that
  emits new tags/attributes must update it deliberately
- Header-auth assets break by design; callers rewrite URLs via the transform hooks
- `FlvKind` grows `"text"` and `ready` detail grows `textKind`; `SourceOptions` grows
  `baseUrl` / `transformAssetUrl` / `transformLinkUrl` (mirrored as `<fl-viewer>`
  properties); one new event (`truncated`) — the event map is now format-aware
- Absolute-remote images load lazily but eagerly-referenced: opening a preview can hit
  remote hosts (tracking-pixel exposure accepted; a click-to-load gate is a future option)
