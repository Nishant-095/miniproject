// Shared by the server and PWA so both conversions keep the same table structure.
export const MAX_PDF_TEXT_CHARACTERS = 10_000_000;
export function validatePdfTextLength(pages) {
  const count = pages.reduce((total, page) => total + page.text.length, 0);
  if (count > MAX_PDF_TEXT_CHARACTERS) throw new Error("PDF-to-Word supports up to 10 million text characters. Split this document into smaller parts.");
}
const compact = text => String(text || "").replace(/\s+/gu, "");

export function pdfPagesToBlocks(textPages, tablePages) {
  const tablesByPage = new Map(tablePages.map(page => [page.num, page.tables]));
  return textPages.map(page => {
    const text = page.text;
    const pageTables = tablesByPage.get(page.num) || [];
    if (!pageTables.length) return text.split(/\r?\n/).filter(line => line.trim()).map(line => ({ type: "paragraph", text: line.trim() }));
    const positions = [];
    let searchable = "";
    for (let i = 0; i < text.length; i++) {
      if (!/\s/u.test(text[i])) { searchable += text[i]; positions.push(i); }
    }
    const matches = [];
    let cursor = 0;
    for (const rows of pageTables) {
      const needle = compact(rows.flat().join(" "));
      if (!rows.length || !rows.some(row => row.length)) continue;
      if (!needle) {
        const at = positions[cursor] ?? text.length;
        matches.push({ start: at, end: at, rows });
        continue;
      }
      const start = searchable.indexOf(needle, cursor);
      if (start < 0) {
        // Never silently flatten a detected grid when reading order is ambiguous.
        throw new Error("A table has an unsupported reading order. Try a simpler PDF or split the document into pages.");
      }
      const end = start + needle.length;
      matches.push({ start: positions[start], end: positions[end - 1] + 1, rows });
      cursor = end;
    }
    const blocks = [];
    const paragraphs = value => value.split(/\r?\n/).filter(line => line.trim()).forEach(line => blocks.push({ type: "paragraph", text: line.trim() }));
    let offset = 0;
    for (const match of matches) {
      paragraphs(text.slice(offset, match.start));
      const columns = Math.max(...match.rows.map(row => row.length));
      blocks.push({ type: "table", columns, rows: match.rows.map(row => row.map((text, index) => ({ text, span: row.length === 1 ? columns : index === row.length - 1 ? columns - row.length + 1 : 1 }))) });
      offset = match.end;
    }
    paragraphs(text.slice(offset));
    return blocks;
  });
}

export function buildWordDocument(pages, docx) {
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeightRule, BorderStyle, TableLayoutType } = docx;
  const para = text => new Paragraph({ children: [new TextRun({ text, size: 19 })], spacing: { before: 0, after: 20, line: 230 } });
  return new Document({
    creator: "UtilityHub",
    styles: { default: { document: { run: { font: "Arial", size: 19 }, paragraph: { spacing: { after: 20 } } } } },
    sections: pages.map(blocks => ({
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 550, right: 600, bottom: 550, left: 600 } } },
      children: blocks.flatMap(block => {
        if (block.type !== "table") return para(block.text);
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          columnWidths: Array(block.columns).fill(Math.floor(11040 / block.columns)),
          borders: Object.fromEntries(["top", "bottom", "left", "right", "insideHorizontal", "insideVertical"].map(side => [side, { style: BorderStyle.SINGLE, size: 6, color: "000000" }])),
          rows: block.rows.map(row => new TableRow({
            cantSplit: true,
            height: { value: row.every(cell => !cell.text.trim()) ? 500 : 340, rule: HeightRule.ATLEAST },
            children: row.map(cell => new TableCell({
              columnSpan: cell.span,
              margins: { top: 55, bottom: 55, left: 65, right: 65 },
              children: String(cell.text).split(/\r?\n/).map(para),
            })),
          })),
        });
        return [table, new Paragraph({ text: "", spacing: { before: 0, after: 60, line: 60 } })];
      }),
    })),
  });
}
