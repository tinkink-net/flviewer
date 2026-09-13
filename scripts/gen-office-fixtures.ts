import { deflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

mkdirSync("test/fixtures", { recursive: true });

// ── Minimal ZIP writer (stored + deflated entries, no compression helpers) ──
interface ZipEntry {
  name: string;
  data: Buffer;
}

function crc32(buf: Buffer): number {
  let crc = -1;
  for (const byte of buf) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function dosDateTime(): { time: number; date: number } {
  return { time: 0, date: (45 << 5) | 1 };
}

function zipOf(entries: ZipEntry[], compress = true): Buffer {
  const parts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { time, date } = dosDateTime();
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const method = compress && entry.data.length > 32 ? 8 : 0;
    const payload = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, payload);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    centralParts.push(dir, nameBuf);
    offset += 30 + nameBuf.length + payload.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, eocd]);
}

// ── DOCX: one paragraph, one run ────────────────────────────────
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Hello flviewer DOCX</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
</w:body>
</w:document>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

writeFileSync(
  "test/fixtures/minimal.docx",
  zipOf(
    [
      { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES) },
      { name: "_rels/.rels", data: Buffer.from(ROOT_RELS) },
      { name: "word/document.xml", data: Buffer.from(DOCUMENT_XML) },
      { name: "word/_rels/document.xml.rels", data: Buffer.from(DOCX_RELS) },
    ],
    false,
  ),
);

// ── XLSX: multi-sheet workbook with a formula, via SheetJS ──────
const wb = XLSX.utils.book_new();
const alpha = XLSX.utils.aoa_to_sheet([
  ["Item", "Qty", "Price"],
  ["Widget", 2, 9.5],
  ["Gadget", 5, 19.99],
]);
alpha["D2"] = { t: "n", f: "B2*C2", v: 19 };
XLSX.utils.book_append_sheet(wb, alpha, "Alpha");
const beta = XLSX.utils.aoa_to_sheet([
  ["Color", "Code"],
  ["Red", "#f00"],
  ["Green", "#0f0"],
]);
XLSX.utils.book_append_sheet(wb, beta, "Beta Sheet");
const xlsxData = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
writeFileSync("test/fixtures/multi-sheet.xlsx", xlsxData);

// ── PPTX: two 16:9 slides, text boxes ───────────────────────────
const PPT_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;

const PPT_PRES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:sldSz cx="9144000" cy="5143500"/>
<p:sldIdLst>
<p:sldId id="256" r:id="rId1"/>
<p:sldId id="257" r:id="rId2"/>
</p:sldIdLst>
</p:presentation>`;

const PPT_PRES_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`;

function slideXml(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:cSld>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr/>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="TextBox"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="6858000" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="4400"/><a:t>${text}</a:t></a:r></a:p></p:txBody>
</p:sp>
</p:spTree>
</p:cSld>
</p:sld>`;
}

const SLIDE1_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

writeFileSync(
  "test/fixtures/minimal.pptx",
  zipOf(
    [
      { name: "[Content_Types].xml", data: Buffer.from(PPT_CONTENT_TYPES) },
      { name: "_rels/.rels", data: Buffer.from(ROOT_RELS) },
      { name: "ppt/presentation.xml", data: Buffer.from(PPT_PRES) },
      { name: "ppt/_rels/presentation.xml.rels", data: Buffer.from(PPT_PRES_RELS) },
      { name: "ppt/slides/slide1.xml", data: Buffer.from(slideXml("Slide One")) },
      { name: "ppt/slides/slide2.xml", data: Buffer.from(slideXml("Slide Two")) },
      { name: "ppt/slides/_rels/slide1.xml.rels", data: Buffer.from(SLIDE1_RELS) },
      { name: "ppt/slides/_rels/slide2.xml.rels", data: Buffer.from(SLIDE1_RELS) },
    ],
    false,
  ),
);

console.log("office fixtures written");
