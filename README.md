# flviewer

Pure client-side file preview for the browser. Images, PDF, video & audio, the text family (txt / code / JSON / CSV / XML / Markdown-as-HTML) and office documents (DOCX / XLSX / PPTX), with a minimal built-in UI.

- **Zero framework dependencies** — vanilla factory API plus a `<fl-viewer>` web component
- **Overlay & Embed** — fullscreen modal via `open()`, or render inside any container via `mount()`
- **Streaming media** — video/audio URL sources play directly from the URL (Range-request seeking, no full download)
- **Lazy engines per format** — image and text previews never download heavy engines: pdf.js (~157 KB gz engine + ~356 KB gz worker), the text pipeline (~86 KB gz), docx-preview (~25 KB gz + shared jszip ~31 KB gz), SheetJS (~171 KB gz) and the pptx renderer (~477 KB gz, incl. echarts for charts) each load only on first use of their format. No consumer configuration required, works in bundled apps, CDN-direct and raw-ESM contexts
- **Typed errors** — failures resolve to `{ code, message, cause? }` events, never exceptions

## Install

```bash
vp install flviewer
# or: npm i flviewer
```

## Quick start

```ts
import { open, mount } from "flviewer";

// Fullscreen overlay (one at a time; a new open() replaces it)
const modal = open("https://cdn.site.com/report.pdf");
modal.close();

// Or embed inside your own container
const viewer = mount(document.querySelector("#preview")!, fileBlob);

// Every source works: URL, Blob, File, ArrayBuffer, Uint8Array
viewer.update(someUint8Array); // swap source, same instance
viewer.destroy(); // idempotent teardown
```

Authenticated URLs:

```ts
open(url, {
  requestInit: { headers: { Authorization: "Bearer …" }, credentials: "include" },
});
```

## Web component

```html
<script type="module">
  import "flviewer";
</script>

<fl-viewer src="https://cdn.site.com/photo.png" style="width: 480px; height: 360px"></fl-viewer>

<script>
  const el = document.querySelector("fl-viewer");
  el.source = fileBlob; // complex values via properties
  el.requestInit = { credentials: "include" };
  el.addEventListener("flv:ready", (e) => console.log(e.detail));
</script>
```

## Events

One event stream, two views — `controller.on(name, cb)` and bubbled `flv:<name>` CustomEvents:

| Event        | Detail                       | Fired when                                  |
| ------------ | ---------------------------- | ------------------------------------------- |
| `ready`      | `{ kind, pages?, name? }`    | content rendered and interactive            |
| `error`      | `{ error: FlvError }`        | typed failure (see below)                   |
| `close`      | `{ by: 'user' \| 'api' }`    | Overlay closed (Esc / button / `close()`)   |
| `pagechange` | `{ page, total }`            | PDF page / XLSX sheet / PPTX slide changed  |
| `zoom`       | `{ scale }`                  | magnification changed                       |
| `truncated`  | `{ bytes?, lines?, cells? }` | preview hit a truncation cap (kept amounts) |

`kind` is one of `image`, `pdf`, `video`, `audio`, `text`, `docx`, `xlsx`, `pptx`.

Error codes: `fetch-error`, `unsupported-type`, `encrypted-pdf`, `encrypted-office`, `render-error`, `aborted`.

## Controls

Toolbar: zoom in/out · fit · 100% · rotate · page prev/next + indicator / sheet dropdown (PDF, XLSX, PPTX) · download · fullscreen · close (Overlay only).
Interactions: select mode (default) — wheel scrolls the document; hand mode — drag pans (clamped) and the wheel zooms; double-click 1×↔2×; keyboard (`Esc`, `+`/`-`, arrows, `0`, `h`/`v`). On touch devices pinch zooms in either mode and swipe pages PDF/PPTX — the continuous zoom buttons and pager arrows make way for those gestures. Text and XLSX views scroll natively.

## Theming

Light DOM, `flv-`-namespaced classes. Theme via CSS custom properties, scoped to the
viewer root (`.flv-root`) so the defaults are actually overridden:

```css
.flv-root {
  --flv-accent: #6ea8fe;
  --flv-bg: rgba(28, 28, 32, 0.92);
  /* Paper surface for rendered Markdown (PDF/DOCX-style document page). */
  --flv-paper: #ffffff;
  --flv-paper-fg: #1f2937;
  --flv-paper-muted: #4b5563;
  --flv-paper-border: rgba(15, 23, 42, 0.14);
  --flv-paper-code: #f3f4f6;
  --flv-paper-link: #2563eb;
}
```

Only the rendered Markdown view uses the paper surface — plain text/code/CSV/XML and
the Markdown source toggle stay on the dark data/chrome surfaces.

## Development

vite-plus toolchain end-to-end:

```bash
pnpm install      # dependencies (pnpm@12.4.1, pinned via packageManager)
vp dev            # playground (manual QA rig)
vp test           # unit (happy-dom) + browser (Playwright Chromium)
vp check          # format + lint + typecheck
vp pack --dts --publint --attw   # release gate
```

### Preview deploy

Hand someone a live build to review — an anonymous Cloudflare Worker with a
60-minute TTL and no account involved:

```bash
scripts/preview-deploy.sh          # prints the live URL + claim URL
```

See [docs/preview-deploys.md](docs/preview-deploys.md) for how the temporary
account works, the claim window and caveats.

Regenerate test fixtures / the inlined pdf.js worker + assets after dependency changes:

```bash
node scripts/gen-fixtures.ts
node scripts/gen-worker-source.ts
node scripts/gen-pdf-assets.ts
```

## Browser support

Evergreen browsers (Chrome, Firefox, Safari, Edge). Requires dynamic `import()`.

## License

MIT
