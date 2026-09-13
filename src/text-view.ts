import { parseCsv } from "./csv";
import { createFlvError } from "./errors";
import { ICONS } from "./icons";
import type { LoadedSource } from "./source";
import { buildTextPreview, tryPrettyJson } from "./text-util";
import type { FlvView, ViewCallbacks } from "./views";

/**
 * Text view (ADR-6): native-scroll rendering, sub-kind-aware. No PanZoom and
 * no mode machinery — the stage scrolls natively and text selection always
 * works. Markdown renders as sanitized HTML with a rendered ↔ source toggle.
 */
export async function createTextView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): Promise<FlvView> {
  if (!loaded.blob) {
    throw createFlvError("render-error", "The text payload is missing.");
  }
  const textKind = loaded.textKind ?? "plain";
  const bytes = new Uint8Array(await loaded.blob.arrayBuffer());
  const preview = buildTextPreview(bytes);
  if (preview.truncated) {
    cb.onTruncated?.({ bytes: preview.keptBytes, lines: preview.keptLines });
  }

  const wrap = document.createElement("div");
  wrap.className = "flv-text";
  const content = document.createElement("div");
  content.className = "flv-text-content";
  wrap.append(content);

  if (preview.truncated) {
    const notice = document.createElement("div");
    notice.className = "flv-truncated";
    notice.setAttribute("role", "status");
    const text = document.createElement("span");
    text.className = "flv-truncated-text";
    text.textContent =
      preview.truncated === "bytes"
        ? `Preview truncated — showing the first ${Math.round(preview.keptBytes / 1024)} KB. Download to view the full file.`
        : `Preview truncated — showing the first ${preview.keptLines.toLocaleString()} lines. Download to view the full file.`;
    const download = document.createElement("button");
    download.type = "button";
    download.className = "flv-truncated-download";
    download.innerHTML = ICONS.download;
    download.setAttribute("aria-label", "Download");
    download.title = "Download";
    download.addEventListener("click", () => cb.onDownload?.());
    notice.append(text, download);
    wrap.append(notice);
  }

  stage.append(wrap);

  /** Rendered ↔ raw (markdown source toggle); resets on every new source. */
  let sourceMode = false;
  let renderSeq = 0;

  const csvDelimiter = (): string => {
    const mime = loaded.blob?.type ?? "";
    if (mime.includes("tab-separated")) {
      return "\t";
    }
    return /\.(tsv|tab)([?#]|$)/i.test(loaded.name ?? "") ? "\t" : ",";
  };

  async function render(): Promise<void> {
    const seq = ++renderSeq;
    if (textKind === "markdown" && !sourceMode) {
      const { renderMarkdown } = await import("./markdown");
      const prose = await renderMarkdown(preview.text, {
        sourceUrl: loaded.url,
        baseUrl: cb.baseUrl,
        transformAssetUrl: cb.transformAssetUrl,
        transformLinkUrl: cb.transformLinkUrl,
      });
      if (seq !== renderSeq) {
        return;
      }
      content.replaceChildren(prose);
      return;
    }
    if (textKind === "csv") {
      const rows = parseCsv(preview.text, csvDelimiter());
      if (seq !== renderSeq) {
        return;
      }
      const table = document.createElement("table");
      table.className = "flv-table";
      const [head, ...body] = rows;
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const cell of head ?? []) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = cell;
        headRow.append(th);
      }
      thead.append(headRow);
      const tbody = document.createElement("tbody");
      for (const row of body) {
        const tr = document.createElement("tr");
        for (const cell of row) {
          const td = document.createElement("td");
          td.textContent = cell;
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(thead, tbody);
      content.replaceChildren(table);
      return;
    }
    if (textKind === "plain") {
      const pre = document.createElement("pre");
      pre.className = "flv-plain";
      pre.textContent = preview.text;
      content.replaceChildren(pre);
      return;
    }
    // code / json / xml / markdown-source: highlighted.
    const { highlightToHtml, langForName } = await import("./hljs");
    let text = preview.text;
    let lang: string | null = null;
    if (textKind === "json") {
      lang = "json";
      const pretty = tryPrettyJson(preview.text);
      if (pretty !== null) {
        text = pretty;
      }
    } else if (textKind === "xml") {
      lang = "xml";
    } else if (textKind === "markdown") {
      lang = "markdown";
    } else {
      lang = langForName(loaded.name);
    }
    const pre = document.createElement("pre");
    pre.className = "flv-code";
    const code = document.createElement("code");
    if (lang) {
      code.className = `hljs language-${lang}`;
    }
    code.innerHTML = highlightToHtml(text, lang);
    pre.append(code);
    if (seq !== renderSeq) {
      return;
    }
    content.replaceChildren(pre);
  }

  void render();

  return {
    hasPages: false,
    zoomBy: () => {},
    fit: () => {},
    hundred: () => {},
    rotate: () => {},
    nextPage: () => {},
    prevPage: () => {},
    setMode: () => {},
    toggleSource:
      textKind === "markdown"
        ? () => {
            sourceMode = !sourceMode;
            cb.onSourceToggle?.(sourceMode);
            void render();
          }
        : undefined,
    destroy: () => {
      renderSeq += 1;
      wrap.remove();
    },
  };
}
