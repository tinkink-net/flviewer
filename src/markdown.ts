/**
 * Rendered Markdown (ADR-6): marked → DOMPurify → DOM decoration.
 * Lives in the text lazy chunk — only reached via dynamic `import()`.
 */
import DOMPurify from "dompurify";
import { marked } from "marked";
import { resolveReference } from "./asset-url";
import { ICONS } from "./icons";
import { highlightToHtml } from "./hljs";
import type { FlvUrlTransform } from "./types";

export interface MarkdownContext {
  /** The document's own URL, when the source is URL-typed. */
  sourceUrl?: string;
  /** Resolution options (see ADR-6 for the per-reference policy). */
  baseUrl?: string;
  transformAssetUrl?: FlvUrlTransform;
  transformLinkUrl?: FlvUrlTransform;
}

/**
 * Explicit allow-list (USE_PROFILES would silently ignore FORBID_*): no
 * active content, no in-prose media, no style/srcset bypasses, no flv-*
 * class spoofing (scrubbed below). `data:` images are kept for inline
 * diagrams; DOMPurify defaults handle `on*` handlers and `javascript:` URIs.
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "details",
    "dfn",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "input",
    "ins",
    "kbd",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "q",
    "s",
    "samp",
    "small",
    "span",
    "strike",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "time",
    "tr",
    "u",
    "ul",
    "var",
  ],
  ALLOWED_ATTR: [
    "abbr",
    "align",
    "alt",
    "checked",
    "class",
    "colspan",
    "dir",
    "disabled",
    "height",
    "href",
    "id",
    "lang",
    "name",
    "rowspan",
    "scope",
    "src",
    "span",
    "start",
    "title",
    "type",
    "width",
  ],
  ADD_DATA_URI_TAGS: ["img"],
  FORBID_TAGS: ["style", "script", "iframe", "form", "object", "embed", "base", "audio", "video"],
  FORBID_ATTR: ["style", "srcset", "srcdoc"],
};

/** Author HTML must not claim flv- names (CONTEXT.md namespace rule). */
function scrubFlvClasses(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>("[class]")) {
    // Snapshot: removing tokens while iterating the live DOMTokenList skips.
    for (const token of Array.from(el.classList)) {
      if (token.startsWith("flv-") || token.startsWith("flv:")) {
        el.classList.remove(token);
      }
    }
  }
}

function slug(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || "section";
}

/** Unique heading ids so `#fragment` links can scroll in view. */
function assignHeadingIds(root: HTMLElement): void {
  const used = new Set<string>([...root.querySelectorAll("[id]")].map((el) => el.id));
  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    let id = slug(heading.textContent ?? "");
    for (let n = 2; used.has(id); n++) {
      id = `${slug(heading.textContent ?? "")}-${n}`;
    }
    used.add(id);
    heading.id = id;
  }
}

function buildAssetPlaceholder(reference: string, alt: string): HTMLElement {
  const placeholder = document.createElement("span");
  placeholder.className = "flv-asset-missing";
  placeholder.innerHTML = ICONS.image;
  // The raw reference (not the alt text) — it names what failed to load.
  const text = document.createElement("span");
  text.className = "flv-asset-missing-label";
  text.textContent = reference || "asset unavailable";
  if (alt) {
    placeholder.title = alt;
  }
  placeholder.append(text);
  return placeholder;
}

/** Force external links safe (new tab + noopener), honor hooks and fragments. */
function decorateLinks(root: HTMLElement, ctx: MarkdownContext): void {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const raw = anchor.getAttribute("href")!;
    const resolved = resolveReference(raw, {
      baseUrl: ctx.baseUrl,
      sourceUrl: ctx.sourceUrl,
      transform: ctx.transformLinkUrl,
    });
    if (resolved.kind === "fragment") {
      anchor.classList.add("flv-anchor");
      continue;
    }
    if (resolved.kind === "missing") {
      anchor.removeAttribute("href");
      anchor.classList.add("flv-link-missing");
      continue;
    }
    anchor.setAttribute("href", resolved.url);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
  // `#fragment` links scroll the rendered document; never navigate anywhere.
  root.addEventListener("click", (ev) => {
    const anchor = (ev.target as HTMLElement | null)?.closest("a");
    if (!anchor || !root.contains(anchor)) {
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href?.startsWith("#")) {
      return;
    }
    ev.preventDefault();
    const target = root.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/**
 * Plain `<img>` per the asset policy (ADR-6): CORS-exempt, lazy, no
 * referrer; failed/absent assets degrade to the styled placeholder.
 */
function decorateImages(root: HTMLElement, ctx: MarkdownContext): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
    const raw = img.getAttribute("src") ?? "";
    const resolved = resolveReference(raw, {
      baseUrl: ctx.baseUrl,
      sourceUrl: ctx.sourceUrl,
      transform: ctx.transformAssetUrl,
    });
    const placeholder = () => {
      img.replaceWith(buildAssetPlaceholder(raw, img.getAttribute("alt") ?? ""));
    };
    if (resolved.kind !== "url") {
      placeholder();
      continue;
    }
    img.setAttribute("src", resolved.url);
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    img.setAttribute("referrerpolicy", "no-referrer");
    img.addEventListener("error", placeholder, { once: true });
  }
}

/** Highlight fenced code blocks with the shared curated highlighter. */
function decorateCodeBlocks(root: HTMLElement): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    const match = /language-([\w+-]+)/.exec(code.className);
    const lang = match?.[1] ?? null;
    code.innerHTML = highlightToHtml(code.textContent ?? "", lang);
    code.classList.add("hljs");
  }
}

/**
 * Parse, sanitize and decorate. The returned `.flv-prose` element is fully
 * sanitized: no script/handlers/javascript: URIs (DOMPurify), no in-prose
 * media, no `style`/`srcset` bypasses.
 */
export async function renderMarkdown(source: string, ctx: MarkdownContext): Promise<HTMLElement> {
  const html = marked.parse(source, { async: false, gfm: true }) as string;
  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);

  const root = document.createElement("div");
  root.className = "flv-prose";
  root.innerHTML = clean;

  scrubFlvClasses(root);
  assignHeadingIds(root);
  decorateLinks(root, ctx);
  decorateImages(root, ctx);
  decorateCodeBlocks(root);
  return root;
}
