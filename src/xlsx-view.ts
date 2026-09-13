import { createFlvError } from "./errors";
import { ICONS } from "./icons";
import type { LoadedSource } from "./source";
import type { FlvView, ViewCallbacks } from "./views";

/** Per-sheet cell cap (ADR-7) — mirrors the text-family truncation pattern. */
const CELL_CAP = 50_000;

type SheetJs = typeof import("xlsx");

/**
 * XLSX view (ADR-7): native-scroll table per sheet, styled by the CSV table
 * CSS (sticky header survives because no transform ancestor exists — zoom
 * machinery is deliberately absent for this kind). Sheets ride the pager
 * slots: prev/next arrows, a `<select>` page indicator, `pagechange` events.
 */
export async function createXlsxView(
  stage: HTMLElement,
  loaded: LoadedSource,
  cb: ViewCallbacks,
): Promise<FlvView> {
  if (!loaded.blob) {
    throw createFlvError("render-error", "The spreadsheet payload is missing.");
  }
  let XLSX: SheetJs;
  try {
    XLSX = await import("xlsx");
  } catch (err) {
    throw createFlvError("render-error", "The spreadsheet engine could not be loaded.", err);
  }

  let workbook: import("xlsx").WorkBook;
  try {
    const data = new Uint8Array(await loaded.blob.arrayBuffer());
    workbook = XLSX.read(data, { type: "array", cellDates: true });
  } catch (err) {
    throw createFlvError("render-error", "The spreadsheet could not be opened.", err);
  }

  const sheetNames = workbook.SheetNames.filter((n) => workbook.Sheets[n]);
  if (sheetNames.length === 0) {
    throw createFlvError("render-error", "The spreadsheet contains no sheets.");
  }

  const wrap = document.createElement("div");
  wrap.className = "flv-text flv-xlsx";
  const content = document.createElement("div");
  content.className = "flv-text-content";
  wrap.append(content);
  stage.append(wrap);

  let sheetIndex = 0;

  function buildTruncatedNotice(keptCells: number, keptRows: number): HTMLElement {
    const notice = document.createElement("div");
    notice.className = "flv-truncated";
    notice.setAttribute("role", "status");
    const text = document.createElement("span");
    text.className = "flv-truncated-text";
    text.textContent = `Sheet truncated — showing the first ${keptCells.toLocaleString()} cells (${keptRows.toLocaleString()} rows). Download to view the full sheet.`;
    const download = document.createElement("button");
    download.type = "button";
    download.className = "flv-truncated-download";
    download.innerHTML = ICONS.download;
    download.setAttribute("aria-label", "Download");
    download.title = "Download";
    download.addEventListener("click", () => cb.onDownload?.());
    notice.append(text, download);
    return notice;
  }

  function cellText(cell: import("xlsx").CellObject | undefined): string {
    if (!cell) {
      return "";
    }
    // `.w` is the formatted text (number/date formats, cached formula values).
    if (typeof cell.w === "string") {
      return cell.w;
    }
    const v = cell.v;
    if (v instanceof Date) {
      return v.toISOString();
    }
    return v === undefined || v === null ? "" : String(v);
  }

  function renderSheet(index: number): void {
    const name = sheetNames[index]!;
    const sheet = workbook.Sheets[name]!;
    const ref = sheet["!ref"] ?? "A1";
    const range = XLSX.utils.decode_range(ref);

    const table = document.createElement("table");
    table.className = "flv-table flv-xlsx-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = cellText(sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]);
      headRow.append(th);
    }
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    let cells = 0;
    let truncated = false;
    let lastRow = range.s.r;
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const tr = document.createElement("tr");
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (cells >= CELL_CAP) {
          truncated = true;
          break;
        }
        const td = document.createElement("td");
        td.textContent = cellText(sheet[XLSX.utils.encode_cell({ r, c })]);
        tr.append(td);
        cells++;
      }
      lastRow = r;
      tbody.append(tr);
      if (truncated) {
        break;
      }
    }
    table.append(thead, tbody);

    content.replaceChildren(table);
    if (truncated) {
      content.append(buildTruncatedNotice(cells, lastRow - range.s.r));
      cb.onTruncated?.({ lines: lastRow - range.s.r, cells });
    }
  }

  function goTo(index: number, notify: boolean): void {
    const target = Math.min(Math.max(0, index), sheetNames.length - 1);
    if (target === sheetIndex) {
      return;
    }
    sheetIndex = target;
    renderSheet(sheetIndex);
    select.value = String(sheetIndex);
    if (notify) {
      cb.onPageChange?.(sheetIndex + 1, sheetNames.length);
    }
  }

  const select = document.createElement("select");
  select.className = "flv-sheet-select";
  select.setAttribute("aria-label", "Sheet");
  sheetNames.forEach((name, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = name;
    select.append(option);
  });
  select.addEventListener("change", () => {
    goTo(Number(select.value), true);
  });

  renderSheet(0);

  return {
    hasPages: true,
    pageCount: sheetNames.length,
    pageSelector: select,
    zoomBy: () => {},
    fit: () => {},
    hundred: () => {},
    rotate: () => {},
    nextPage: () => goTo(sheetIndex + 1, true),
    prevPage: () => goTo(sheetIndex - 1, true),
    setMode: () => {},
    destroy: () => {
      wrap.remove();
    },
  };
}
