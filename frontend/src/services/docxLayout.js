import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const OFFICE = "urn:schemas-microsoft-com:office:office";
export const xmlChildren = (node, name) => [...(node?.children || [])].filter(child => child.localName === name);
export const xmlFirst = (node, name) => xmlChildren(node, name)[0];
export const wordAttribute = (node, name) => node?.getAttributeNS(WORD, name) || node?.getAttribute(name);
const descendants = (node, name) => [...node.getElementsByTagNameNS("*", name)];

export function readDocxArchive(bytes) {
  let expanded = 0;
  const files = unzipSync(bytes, { filter(entry) {
    expanded += entry.originalSize;
    if (expanded > 100 * 1024 * 1024) throw new Error("The expanded Word document exceeds 100 MB. Convert a smaller file.");
    return true;
  } });
  if (!files["word/document.xml"]) throw new Error("This Word file is missing its document content.");
  for (const [name, data] of Object.entries(files)) {
    if (!name.endsWith(".rels")) continue;
    const xml = strFromU8(data);
    // Do not let a document trigger a network request for linked pictures or fonts.
    if (/<Relationship\b[^>]*TargetMode\s*=\s*["']External["'][^>]*>/i.test(xml)) {
      const relationships = xml.match(/<Relationship\b[^>]*\/?\s*>/gi) || [];
      if (relationships.some(row => /TargetMode\s*=\s*["']External["']/i.test(row) && /Type\s*=\s*["'][^"']*\/(?:image|font|attachedTemplate)["']/i.test(row))) {
        throw new Error("This Word file links to an external picture, font, or template. Embed that content in Word before converting. External files are never downloaded.");
      }
    }
  }
  return files;
}
function parse(bytes) {
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("This Word document contains unsupported XML declarations.");
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("This Word document contains invalid XML.");
  return xml;
}
function sectionSettings(node) {
  const size = xmlFirst(node, "pgSz"), margins = xmlFirst(node, "pgMar"), borders = xmlFirst(node, "pgBorders");
  return {
    width: Number(wordAttribute(size, "w") || 11906) / 20,
    height: Number(wordAttribute(size, "h") || 16838) / 20,
    borders: borders ? {
      offset: wordAttribute(borders, "offsetFrom") || "text",
      sides: ["top", "right", "bottom", "left"].map(side => {
        const border = xmlFirst(borders, side), style = wordAttribute(border, "val");
        return !border || ["nil", "none"].includes(style) ? null : {
          side, style, size: Number(wordAttribute(border, "sz") || 4) / 8,
          space: Number(wordAttribute(border, "space") || 0),
          color: wordAttribute(border, "color"), margin: Number(wordAttribute(margins, side) || 1440) / 20,
        };
      }).filter(Boolean),
    } : null,
  };
}

// Add harmless bookmarks so document properties can be applied after HTML rendering.
export function prepareDocxLayout(files) {
  const paragraphs = new Map(), sections = [];
  let nextId = 1000000;
  for (const [name, data] of Object.entries(files)) {
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) continue;
    const xml = parse(data);
    if (descendants(xml, "chart").length || descendants(xml, "altChunk").length) {
      throw new Error("This Word file contains a native chart or an embedded document that the offline renderer cannot reproduce. Export it to PDF in Word or LibreOffice to preserve that content.");
    }
    const allParagraphs = descendants(xml, "p");
    const body = descendants(xml, "body")[0];
    const sectionEnds = body ? [...body.children].map((node, index) => ({ node: node.localName === "sectPr" ? node : xmlFirst(xmlFirst(node, "pPr"), "sectPr"), index })).filter(row => row.node) : [];
    if (body) sectionEnds.forEach(row => sections.push(sectionSettings(row.node)));
    for (const p of allParagraphs) {
      const id = `uh_para_${nextId++}`, properties = xmlFirst(p, "pPr"), mark = xmlFirst(properties, "rPr");
      let top = p;
      while (top.parentElement && top.parentElement !== body) top = top.parentElement;
      const position = body ? [...body.children].indexOf(top) : -1;
      const section = body ? Math.max(0, sectionEnds.findIndex(row => row.index >= position)) : 0;
      const rule = descendants(p, "rect").find(rect => ["t", "true", "1"].includes(rect.getAttributeNS(OFFICE, "hr")));
      const style = rule?.getAttribute("style") || "";
      paragraphs.set(id, {
        section,
        size: Number(wordAttribute(xmlFirst(mark, "sz"), "val") || 0) / 2,
        family: wordAttribute(xmlFirst(mark, "rFonts"), "ascii"),
        keepNext: properties && descendants(properties, "keepNext").some(node => !["0", "false", "off"].includes(wordAttribute(node, "val"))),
        borders: [...(xmlFirst(properties, "pBdr")?.children || [])].map(node => ({ side: node.localName, style: wordAttribute(node, "val"), size: Number(wordAttribute(node, "sz") || 4) / 8, space: Number(wordAttribute(node, "space") || 0), color: wordAttribute(node, "color") })),
        rule: rule ? { height: /height:\s*([\d.]+)pt/i.exec(style)?.[1] || "1", color: rule.getAttribute("fillcolor") || "#a0a0a0" } : null,
      });
      const start = xml.createElementNS(WORD, "w:bookmarkStart"); start.setAttributeNS(WORD, "w:id", String(nextId)); start.setAttributeNS(WORD, "w:name", id);
      const end = xml.createElementNS(WORD, "w:bookmarkEnd"); end.setAttributeNS(WORD, "w:id", String(nextId));
      p.insertBefore(start, properties ? properties.nextSibling : p.firstChild); p.appendChild(end);
    }
    files[name] = strToU8(new XMLSerializer().serializeToString(xml));
  }
  return { bytes: zipSync(files, { level: 1 }), paragraphs, sections };
}

