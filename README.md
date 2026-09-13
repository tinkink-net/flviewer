# flviewer

Pure client-side file preview for the browser. Images, PDF, video & audio, with a minimal built-in UI.

- **Zero framework dependencies** — vanilla factory API plus a `<fl-viewer>` web component
- **Overlay & Embed** — fullscreen modal via `open()`, or render inside any container via `mount()`
- **Streaming media** — video/audio URL sources play directly from the URL (Range-request seeking, no full download)
- **Lazy pdf.js** — image previews never download the PDF engine; on first PDF preview the viewer loads a ~157 KB gz engine chunk plus a ~357 KB gz worker chunk. No consumer configuration required, works in bundled apps, CDN-direct and raw-ESM contexts
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

| Event        | Detail                    | Fired when                                |
| ------------ | ------------------------- | ----------------------------------------- |
| `ready`      | `{ kind, pages?, name? }` | content rendered and interactive          |
| `error`      | `{ error: FlvError }`     | typed failure (see below)                 |
| `close`      | `{ by: 'user' \| 'api' }` | Overlay closed (Esc / button / `close()`) |
| `pagechange` | `{ page, total }`         | visible PDF page changed                  |
| `zoom`       | `{ scale }`               | magnification changed                     |

`kind` is one of `image`, `pdf`, `video`, `audio`.

Error codes: `fetch-error`, `unsupported-type`, `encrypted-pdf`, `render-error`, `aborted`.

## Controls

Toolbar: zoom in/out · fit · 100% · rotate · page prev/next + indicator (PDF only) · download · fullscreen · close (Overlay only).
Interactions: wheel/pinch zoom, pan, double-click 1×↔2×, keyboard (`Esc`, `+`/`-`, arrows, `0`).

## Theming

Light DOM, `flv-`-namespaced classes. Theme via CSS custom properties:

```css
:root {
  --flv-accent: #6ea8fe;
  --flv-bg: rgba(28, 28, 32, 0.92);
}
```

## Development

vite-plus toolchain end-to-end:

```bash
pnpm install      # dependencies (pnpm@12.4.1, pinned via packageManager)
vp dev            # playground (manual QA rig)
vp test           # unit (happy-dom) + browser (Playwright Chromium)
vp check          # format + lint + typecheck
vp pack --dts --publint --attw   # release gate
```

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
