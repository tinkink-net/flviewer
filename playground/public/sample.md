# flviewer Markdown sample

This file exercises the rendered-HTML pipeline (ADR-6): structure, code,
assets and the sanitizer. A relative image (`tiny.png`, served next to this
file) and a remote image follow.

## Asset resolution

Relative image — resolves against this document's URL:

![tiny local](tiny.png)

Remote image — loads directly (`<img>` is CORS-exempt; `loading="lazy"`,
`referrerPolicy="no-referrer"`):

![remote](https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png)

The same image via the `transformAssetUrl` hook in `main.ts` gets rewritten
with a query string — open the demo marked _hook_ to see it.

## Structure

1. Ordered list item
2. Another one with **bold**, _italic_, `inline code`
   - Nested bullet
   - [x] Task list item
   - [ ] Unchecked item

> Blockquote — sanitized prose never executes code and never leaves the
> `flv-` namespace.

| Format  | Sub-kind   | Rendered as         |
| ------- | ---------- | ------------------- |
| `.txt`  | `plain`    | raw text            |
| `.ts`   | `code`     | highlighted         |
| `.json` | `json`     | pretty-printed      |
| `.csv`  | `csv`      | sticky-header table |
| `.md`   | `markdown` | **this view**       |

### Code block

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

## Sanitizer demo

Everything dangerous below must be stripped silently:

<script>alert('script')</script>
<img src="tiny.png" onerror="alert('onerror')">
<div style="position:fixed;top:0;left:0;z-index:99999">style escape attempt</div>
<iframe srcdoc="<script>alert(1)</script>"></iframe>

If you can read this, the sanitizer kept the prose alive.

## Links

- [External link](https://github.com/tinkink/flviewer) — new tab, `noopener noreferrer`.
- [Fragment link](#asset-resolution) — scrolls in view.
- [Baseless relative link](no-base.md) — stripped to text when no base exists.

---

Jump back: [top](#flviewer-markdown-sample)
