import { PDFDocument, StandardFonts } from "pdf-lib";
import { MAX_PDF_TEXT_CHARACTERS } from "./documentLayout.js";

const identity = [1, 0, 0, 1, 0, 0];
const safeText = value => String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const compact = value => value.replace(/\s+/gu, "");
const right = box => box.x + box.width;
const bottom = box => box.y + box.height;
const inside = (box, x, y, tolerance = 0) => x >= box.x - tolerance && x <= right(box) + tolerance && y >= box.y - tolerance && y <= bottom(box) + tolerance;
const union = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(right(a), right(b)) - Math.min(a.x, b.x), height: Math.max(bottom(a), bottom(b)) - Math.min(a.y, b.y) });
const intersection = (a, b) => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), width: Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)), height: Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y)) });
const color = value => /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).toUpperCase() : "000000";

function cancelled(signal) {
  if (signal?.aborted) throw new DOMException("Conversion cancelled.", "AbortError");
}

function transformedBox(bounds, matrix, util) {
  const points = [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[3]]].map(point => { util.applyTransform(point, matrix); return point; });
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

// Use the standard Word font metrics rather than machine-specific canvas fonts.
export async function wordTextMeasure(fallback) {
  const pdf = await PDFDocument.create(), fonts = new Map();
  for (const name of ["Helvetica", "HelveticaBold", "HelveticaOblique", "HelveticaBoldOblique", "TimesRoman", "TimesRomanBold", "TimesRomanItalic", "TimesRomanBoldItalic", "Courier", "CourierBold", "CourierOblique", "CourierBoldOblique"]) fonts.set(name, await pdf.embedFont(StandardFonts[name]));
  return item => {
    let name = item.font === "Times New Roman" ? "TimesRoman" : item.font === "Courier New" ? "Courier" : "Helvetica";
    name += item.bold ? "Bold" : ""; name += item.italic ? item.font === "Times New Roman" ? "Italic" : "Oblique" : "";
    try { return fonts.get(name).widthOfTextAtSize(item.text, item.size); }
    catch { return fallback(item); }
  };
}

// Read original drawing operations, not page screenshots or OCR results.
export function drawingStructure(operators, viewport, pdfjs, geometry) {
  const { OPS, Util } = pdfjs;
  const { LineStore, Line, Point } = geometry;
  const store = new LineStore(), paths = [], images = [], textPaints = [];
  let state = { matrix: identity, fill: "#000000", stroke: "#000000", font: "", hidden: false, clipped: false, clipBounds: null, clipComplex: false, lineWidth: 1, fillAlpha: 1, strokeAlpha: 1, dash: [], dashOffset: 0, lineCap: 0, lineJoin: 0, unsupported: false };
  let pendingClip = false;
  const stack = [];
  const save = () => stack.push({ ...state, matrix: [...state.matrix] });
  const restore = () => { if (stack.length) state = stack.pop(); };
  const clip = (box, complex = false) => { if (box) state.clipBounds = state.clipBounds ? intersection(state.clipBounds, box) : box; state.clipped = true; state.clipComplex ||= complex; };
  let currentOrder = 0;
  const image = (data, matrix = state.matrix, extra = {}) => {
    const transform = Util.transform(viewport.transform, matrix);
    let box = transformedBox([0, 0, 1, 1], transform, Util);
    if (state.clipBounds) box = intersection(box, state.clipBounds);
    if (box.width > 0 && box.height > 0) images.push({ ...box, transform, data, clipped: state.clipped, clipComplex: state.clipComplex, unsupported: state.unsupported, order: currentOrder, ...extra });
  };
  for (let i = 0; i < operators.fnArray.length; i++) {
    currentOrder = i;
    const fn = operators.fnArray[i], args = operators.argsArray[i] || [];
    if (fn === OPS.save) save();
    else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd || fn === OPS.endGroup) restore();
    else if (fn === OPS.transform) state.matrix = Util.transform(state.matrix, args);
    else if (fn === OPS.paintFormXObjectBegin || fn === OPS.beginGroup) {
      save();
      const matrix = fn === OPS.beginGroup ? args[0]?.matrix : args[0];
      if (matrix) state.matrix = Util.transform(state.matrix, matrix);
      const bbox = fn === OPS.beginGroup ? args[0]?.bbox : args[1];
      if (bbox) {
        const combined = Util.transform(viewport.transform, state.matrix);
        clip(transformedBox(bbox, combined, Util), Math.abs(combined[0] * combined[1]) > 0.01 || Math.abs(combined[2] * combined[3]) > 0.01);
      }
      if (fn === OPS.beginGroup && args[0]?.smask) state.unsupported = true;
    } else if (fn === OPS.setFillRGBColor) state.fill = args[0];
    else if (fn === OPS.setStrokeRGBColor) state.stroke = args[0];
    else if (fn === OPS.setLineWidth) state.lineWidth = args[0];
    else if (fn === OPS.setDash) { state.dash = args[0]; state.dashOffset = args[1]; }
    else if (fn === OPS.setLineCap) state.lineCap = args[0];
    else if (fn === OPS.setLineJoin) state.lineJoin = args[0];
    else if (fn === OPS.setFillColorN || fn === OPS.setStrokeColorN) state.unsupported = true;
    else if (fn === OPS.setGState) {
      for (const [key, value] of args[0]) {
        if (key === "ca") state.fillAlpha = value;
        else if (key === "CA") state.strokeAlpha = value;
        else if (key === "LW") state.lineWidth = value;
        else if (key === "BM" && value !== "source-over" && value !== "Normal") state.unsupported = true;
        else if (key === "SMask" && value) state.unsupported = true;
      }
    }
    else if (fn === OPS.setFont) state.font = args[0];
    else if (fn === OPS.setTextRenderingMode) state.hidden = args[0] === 3;
    else if (fn === OPS.clip || fn === OPS.eoClip) pendingClip = true;
    else if (fn === OPS.showText) {
      textPaints.push({ text: compact((args[0] || []).filter(glyph => typeof glyph === "object").map(glyph => glyph.unicode || "").join("")), color: color(state.fill), font: state.font, hidden: state.hidden });
    } else if (fn === OPS.constructPath && args[2]?.every(Number.isFinite)) {
      const bounds = args[2], op = args[0];
      const matrix = Util.transform(viewport.transform, state.matrix);
      const box = transformedBox(bounds, matrix, Util);
      const stroke = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(op);
      const filled = ![OPS.stroke, OPS.closeStroke, OPS.endPath].includes(op);
      const path = { ...box, order: i, stroke, filled, color: color(filled ? state.fill : state.stroke), complex: false, paint: { ...state, matrix }, buffer: args[1]?.[0], evenOdd: [OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke].includes(op) };
      const data = path.buffer;
      // PDF.js batches path construction after the clip instruction. The clip
      // takes effect when this path is consumed, after its own paint operation.
      if (pendingClip) {
        const rectangle = data?.length === 13 && data[0] === 0 && data[3] === 1 && data[6] === 1 && data[9] === 1 && data[12] === 3;
        clip(box, !rectangle); pendingClip = false;
      }
      if (op !== OPS.endPath) paths.push(path);
      // Use pdf-parse's public geometry classes, preserving blank and merged cells.
      if (stroke && args[1]?.[0]?.length) {
        const buffer = args[1][0]; let from, first;
        const segment = (a, b) => {
          if (!a || !b) return;
          const line = new Line(new Point(a[0], a[1]), new Point(b[0], b[1]));
          line.transform(state.matrix); line.transform(viewport.transform); store.add(line);
        };
        for (let p = 0; p < buffer.length;) {
          const command = buffer[p++];
          if (command === 0) { from = [buffer[p++], buffer[p++]]; first = from; }
          else if (command === 1) { const to = [buffer[p++], buffer[p++]]; if (from && Math.abs(from[0] - to[0]) > 0.1 && Math.abs(from[1] - to[1]) > 0.1) path.complex = true; segment(from, to); from = to; }
          else if (command === 2) { path.complex = true; p += 4; from = [buffer[p++], buffer[p++]]; }
          else if (command === 3) { segment(from, first); from = first; }
          else break;
        }
      }
    } else if ([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(fn)) image(args[0], state.matrix, { mask: fn === OPS.paintImageMaskXObject });
    else if (fn === OPS.paintImageXObjectRepeat) {
      for (let j = 0; j < args[3].length; j += 2) image(args[0], Util.transform(state.matrix, [args[1], 0, 0, args[2], args[3][j], args[3][j + 1]]));
    } else if (fn === OPS.paintImageMaskXObjectRepeat) {
      for (let j = 0; j < args[5].length; j += 2) image(args[0], Util.transform(state.matrix, [args[1], args[2], args[3], args[4], args[5][j], args[5][j + 1]]), { mask: true });
    } else if (fn === OPS.paintInlineImageXObjectGroup) {
      for (const part of args[1]) image(args[0], Util.transform(state.matrix, part.transform), { clipped: true });
    } else if (fn === OPS.paintImageMaskXObjectGroup) {
      for (const part of args[0]) image(part, Util.transform(state.matrix, part.transform), { mask: true });
    }
  }
  store.normalize();
  const tables = store.getTableData().filter(table => table.rows.length && table.colPivots.length > 1 && table.check());
  return { paths, images, tables, textPaints };
}

function fontStyle(page, key, fallback) {
  let font;
  try { if (page.commonObjs.has(key)) font = page.commonObjs.get(key); } catch { /* Use text-content font metadata. */ }
  const name = (font?.name || fallback.fontFamily || "Arial").replace(/^[A-Z]{6}\+/, "");
  const bold = Boolean(font?.bold || /bold|black|heavy|semibold/i.test(name));
  const italic = Boolean(font?.italic || /italic|oblique/i.test(name));
  let family = name.replace(/[-,]?(BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular|Roman|MT|PSMT)$/gi, "");
  if (/helvetica|arial|sans-serif/i.test(name)) family = "Arial";
  else if (/times|minion|warnock|georgia|cambria|garamond|^serif$/i.test(name)) family = "Times New Roman";
  else if (/courier|mono/i.test(name)) family = "Courier New";
  else family = "Arial";
  return { font: family || "Arial", bold, italic };
}

export function positionedText(content, viewport, page, paints, pdfjs) {
  let search = "", cursor = 0, paintIndex = 0;
  const offsets = paints.map(paint => { const start = search.length; search += paint.text; return start; });
  return content.items.filter(item => typeof item.str === "string" && item.str.length).map(item => {
    const transform = pdfjs.Util.transform(viewport.transform, item.transform), style = content.styles[item.fontName] || {};
    const size = Math.max(1, Math.hypot(transform[2], transform[3]));
    const needle = compact(item.str), index = needle ? search.indexOf(needle, cursor) : -1;
    if (index >= 0) { cursor = index + needle.length; while (paintIndex + 1 < offsets.length && offsets[paintIndex + 1] <= index) paintIndex++; }
    return { text: safeText(item.str), x: transform[4], y: transform[5] - size * (style.ascent || 0.8), baseline: transform[5], width: Math.abs(item.width) * Math.hypot(viewport.transform[0], viewport.transform[1]), height: size, size,
      angle: Math.atan2(transform[1], transform[0]) * 180 / Math.PI, ...fontStyle(page, item.fontName, style), color: paints[paintIndex]?.color || "000000", hidden: paints[paintIndex]?.hidden || false, hasEOL: item.hasEOL };
  });
}

function tableBox(table) {
  return { x: table.minXY.x, y: table.minXY.y, width: table.maxXY.x - table.minXY.x, height: table.maxXY.y - table.minXY.y };
}

function fillTables(tables, text) {
  for (const table of tables) for (const row of table.rows) for (const cell of row) cell.items = [];
  for (const item of text) {
    const table = tables.find(table => inside(tableBox(table), item.x + 1, item.y + item.height / 2));
    const cell = table?.findCell(item.x + Math.min(item.width / 2, 2), item.y + item.height / 2);
    if (cell) { cell.items.push(item); item.inTable = true; }
  }
}

function joinLines(text) {
  const lines = [];
  for (const item of text.filter(item => !item.inTable && !item.inFigure && !item.hidden && item.text.trim()).sort((a, b) => a.baseline - b.baseline || a.x - b.x)) {
    const line = lines.findLast(line => Math.abs(line.baseline - item.baseline) < Math.min(line.height, item.height) * 0.25 && item.x - right(line) >= -2 && item.x - right(line) < Math.max(12, item.size * 1.6) && Math.abs(line.angle - item.angle) < 1);
    if (line) { line.items.push(item); line.width = Math.max(right(line), right(item)) - line.x; line.height = Math.max(line.height, item.height); line.y = Math.min(line.y, item.y); }
    else lines.push({ ...item, items: [item] });
  }
  return lines;
}

export function textBlocks(text) {
  const blocks = [];
  for (const line of joinLines(text)) {
    const block = blocks.findLast(block => Math.abs(block.x - line.x) < 3 && Math.abs(block.size - line.size) < 0.6 && Math.abs(block.angle - line.angle) < 1 && line.baseline - block.lastBaseline >= line.size * 0.8 && line.baseline - block.lastBaseline <= line.size * 1.7);
    if (block) { block.lines.push(line); block.width = Math.max(right(block), right(line)) - block.x; block.height = bottom(line) - block.y; block.lastBaseline = line.baseline; }
    else blocks.push({ x: line.x, y: line.y, width: line.width, height: line.height, size: line.size, angle: line.angle, lines: [line], lastBaseline: line.baseline });
  }
  // Position determines appearance; column-first ordering also makes copying useful.
  return blocks.sort((a, b) => Math.abs(a.y - b.y) < 20 && Math.abs(a.x - b.x) > 40 ? a.x - b.x : a.y - b.y);
}

function figureRegions(paths, images, tables, text, width, height) {
  const bounds = tables.map(tableBox);
  const regions = [];
  for (const path of paths) {
    if (path.color === "FFFFFF" || path.width * path.height > width * height * 0.9) continue;
    if (path.filled && path.height < 25 && Math.min(...path.color.match(/../g).map(channel => parseInt(channel, 16))) > 225 && text.some(item => inside(path, item.x + item.width / 2, item.y + item.height / 2))) continue;
    if (bounds.some(box => inside(box, path.x, path.y, 2) && inside(box, right(path), bottom(path), 2))) continue;
    let region = { ...path, paths: [path] };
    for (let i = regions.length - 1; i >= 0; i--) {
      const other = regions[i];
      const gapX = Math.max(0, Math.max(region.x, other.x) - Math.min(right(region), right(other)));
      const gapY = Math.max(0, Math.max(region.y, other.y) - Math.min(bottom(region), bottom(other)));
      if ((gapX <= 6 && gapY <= 6) || (Math.abs(bottom(region) - bottom(other)) < 3 && gapX < 80 && Math.min(region.height, other.height) > 8)) { region = { ...union(region, other), paths: [...region.paths, ...other.paths] }; regions.splice(i, 1); }
    }
    regions.push(region);
  }
  const figures = regions.filter(box => box.width > 8 && box.height > 8);
  for (const image of images) {
    const figure = figures.find(box => inside(box, image.x + image.width / 2, image.y + image.height / 2, 4));
    if (figure) { Object.assign(figure, union(figure, image)); (figure.embeddedImages ||= []).push(image); }
    else figures.push({ ...image, image });
  }
  for (const figure of figures) {
    if (!figure.image) {
      for (const item of text) {
        if (inside(figure, item.x + item.width / 2, item.y + item.height / 2, item.text.length < 25 ? 16 : 0)) Object.assign(figure, union(figure, item));
      }
    }
    const pad = figure.image ? 0 : 1;
    const x = Math.max(0, figure.x - pad), y = Math.max(0, figure.y - pad);
    Object.assign(figure, { x, y, width: Math.min(width - x, figure.width + pad * 2), height: Math.min(height - y, figure.height + pad * 2) });
  }
  return figures.filter(figure => figure.width > 0 && figure.height > 0);
}

async function imageObject(page, value) {
  if (typeof value !== "string") return value;
  return new Promise(resolve => (value.startsWith("g_") ? page.commonObjs : page.objs).get(value, resolve));
}

async function copyImage(page, image, createCanvas, encodeCanvas) {
  if (image.mask || image.clipComplex || image.unsupported) return null;
  const source = await imageObject(page, image.data);
  if (!source?.width || !source.height || source.width * source.height > 40_000_000) return null;
  const canvas = createCanvas(source.width, source.height), context = canvas.getContext("2d");
  try {
    if (source.bitmap) context.drawImage(source.bitmap, 0, 0);
    else if (source.data) {
      const pixels = context.createImageData(source.width, source.height), data = source.data;
      if (source.kind === 3 || data.length === pixels.data.length) pixels.data.set(data);
      else if (source.kind === 2 || data.length === source.width * source.height * 3) {
        for (let i = 0, j = 0; i < data.length; i += 3, j += 4) { pixels.data[j] = data[i]; pixels.data[j + 1] = data[i + 1]; pixels.data[j + 2] = data[i + 2]; pixels.data[j + 3] = 255; }
      } else if (source.kind === 1) {
        const stride = Math.ceil(source.width / 8);
        for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) { const gray = data[y * stride + (x >> 3)] >> (7 - (x & 7)) & 1 ? 255 : 0; const i = (y * source.width + x) * 4; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray; pixels.data[i + 3] = 255; }
      } else return null;
      context.putImageData(pixels, 0, 0);
    } else return null;
    const m = image.transform;
    if (Math.abs(m[1]) < 0.01 && Math.abs(m[2]) < 0.01 && m[0] > 0 && m[3] < 0 && Math.abs(m[0] - image.width) < 0.1 && Math.abs(-m[3] - image.height) < 0.1) return await encodeCanvas(canvas);
    const scale = Math.min(source.width / Math.max(1, Math.hypot(m[0], m[1])), source.height / Math.max(1, Math.hypot(m[2], m[3])), 4000 / Math.max(image.width, image.height), Math.sqrt(16_000_000 / (image.width * image.height)));
    const output = createCanvas(Math.max(1, Math.ceil(image.width * scale)), Math.max(1, Math.ceil(image.height * scale))), target = output.getContext("2d");
    try {
      target.setTransform(m[0] / source.width * scale, m[1] / source.width * scale, -m[2] / source.height * scale, -m[3] / source.height * scale, (m[4] + m[2] - image.x) * scale, (m[5] + m[3] - image.y) * scale);
      target.drawImage(canvas, 0, 0); return await encodeCanvas(output);
    } finally { output.width = 1; output.height = 1; }
  } finally { canvas.width = 1; canvas.height = 1; }
}

async function captureFigure(page, box, createCanvas, encodeCanvas, signal, pdfjs) {
  const scale = Math.min(2, 2400 / Math.max(box.width, box.height), Math.sqrt(4_000_000 / (box.width * box.height)));
  const canvas = createCanvas(Math.max(1, Math.ceil(box.width * scale)), Math.max(1, Math.ceil(box.height * scale)));
  let task, renderOperators;
  const textOperations = new Set([pdfjs.OPS.showText, pdfjs.OPS.showSpacedText, pdfjs.OPS.nextLineShowText, pdfjs.OPS.nextLineSetSpacingShowText]);
  // PDF.js 5.4.296 optimizes display and extraction lists differently. Read the
  // active render's own list; extraction indexes must never filter a render.
  const graphicsOnly = index => {
    renderOperators ||= [...page._intentStates.values()].find(state => [...(state.renderTasks || [])].some(render => render.task === task))?.operatorList;
    if (!renderOperators) throw new Error("The PDF graphics renderer changed. Reload the app or use the matching PDF.js version.");
    return !textOperations.has(renderOperators.fnArray[index]);
  };
  task = page.render({ operationsFilter: graphicsOnly, canvas, canvasContext: canvas.getContext("2d"), viewport: page.getViewport({ scale: 1 }), transform: [scale, 0, 0, scale, -box.x * scale, -box.y * scale], background: "white" });
  const abort = () => task.cancel(); signal?.addEventListener("abort", abort, { once: true });
  try { await task.promise; cancelled(signal); return await encodeCanvas(canvas); }
  finally { signal?.removeEventListener("abort", abort); canvas.width = 1; canvas.height = 1; }
}

// Copy ordinary vector paths directly, leaving their text as editable Word text.
async function copyVectors(page, figure, createCanvas, encodeCanvas, loadImage) {
  if (!figure.paths?.length || figure.embeddedImages?.length && !loadImage || figure.paths.some(path => !path.buffer?.length || path.paint.unsupported || path.paint.clipComplex)) return null;
  const scale = Math.min(2, 2400 / Math.max(figure.width, figure.height), Math.sqrt(4_000_000 / (figure.width * figure.height)));
  const canvas = createCanvas(Math.max(1, Math.ceil(figure.width * scale)), Math.max(1, Math.ceil(figure.height * scale))), context = canvas.getContext("2d");
  try {
    const operations = [...figure.paths, ...(figure.embeddedImages || []).map(image => ({ image, order: image.order }))].sort((a, b) => a.order - b.order);
    for (const path of operations) {
      if (path.image) {
        const bytes = await copyImage(page, path.image, createCanvas, encodeCanvas);
        if (!bytes) return null;
        const image = await loadImage(bytes);
        try {
          context.setTransform(scale, 0, 0, scale, -figure.x * scale, -figure.y * scale);
          context.drawImage(image, path.image.x, path.image.y, path.image.width, path.image.height);
        } finally { image.close?.(); }
        continue;
      }
      const state = path.paint, m = state.matrix;
      context.save();
      if (state.clipBounds) {
        context.setTransform(scale, 0, 0, scale, -figure.x * scale, -figure.y * scale);
        context.beginPath(); context.rect(state.clipBounds.x, state.clipBounds.y, state.clipBounds.width, state.clipBounds.height); context.clip();
      }
      context.setTransform(m[0] * scale, m[1] * scale, m[2] * scale, m[3] * scale, (m[4] - figure.x) * scale, (m[5] - figure.y) * scale);
      context.beginPath();
      for (let p = 0; p < path.buffer.length;) {
        const op = path.buffer[p++];
        if (op === 0) context.moveTo(path.buffer[p++], path.buffer[p++]);
        else if (op === 1) context.lineTo(path.buffer[p++], path.buffer[p++]);
        else if (op === 2) { context.bezierCurveTo(...path.buffer.slice(p, p + 6)); p += 6; }
        else if (op === 3) context.closePath();
        else return null;
      }
      if (path.filled) { context.globalAlpha = state.fillAlpha; context.fillStyle = state.fill; context.fill(path.evenOdd ? "evenodd" : "nonzero"); }
      if (path.stroke) {
        context.globalAlpha = state.strokeAlpha; context.strokeStyle = state.stroke; context.lineWidth = state.lineWidth || 0.25;
        context.lineCap = ["butt", "round", "square"][state.lineCap] || "butt"; context.lineJoin = ["miter", "round", "bevel"][state.lineJoin] || "miter";
        context.setLineDash(state.dash || []); context.lineDashOffset = state.dashOffset || 0; context.stroke();
      }
      context.restore();
    }
    return await encodeCanvas(canvas);
  } finally { canvas.width = 1; canvas.height = 1; }
}

export async function analyzePdfStructure(bytes, { pdfjs, geometry, createCanvas, encodeCanvas, loadImage, measureText, pdfOptions = {}, signal, onProgress = () => {} }) {
  cancelled(signal);
  if (!bytes.byteLength || bytes.byteLength > 80 * 1024 * 1024) throw new Error("Choose a non-empty PDF of 80 MB or less.");
  let pdf;
  const pages = []; let characters = 0, imageBytes = 0;
  try {
    pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, ...pdfOptions }).promise;
    if (!pdf.numPages || pdf.numPages > 1000) throw new Error("Use a PDF with 1 to 1000 pages.");
    for (let number = 1; number <= pdf.numPages; number++) {
      cancelled(signal); onProgress({ percent: (number - 1) / pdf.numPages * 90, message: `Analyzing page ${number} of ${pdf.numPages}…` });
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      characters += content.items.reduce((sum, item) => sum + (item.str?.length || 0), 0);
      if (characters > MAX_PDF_TEXT_CHARACTERS) throw new Error("PDF-to-Word supports up to 10 million text characters. Split this document into smaller parts.");
      const drawings = drawingStructure(await page.getOperatorList(), viewport, pdfjs, geometry);
      const items = positionedText(content, viewport, page, drawings.textPaints, pdfjs);
      for (const item of items) {
        const measured = measureText?.(item);
        if (measured > 0 && item.width > 0) item.wordScale = Math.max(1, Math.min(600, Math.round(item.width / measured * 100)));
        const highlight = drawings.paths.find(path => path.filled && path.color !== "FFFFFF" && path.height < 25 && Math.min(...path.color.match(/../g).map(channel => parseInt(channel, 16))) > 225 && inside(path, item.x + item.width / 2, item.y + item.height / 2));
        if (highlight) item.shading = highlight.color;
      }
      // A plotted grid with data curves/bars is a figure, not a spreadsheet table.
      const tables = drawings.tables.filter(table => !drawings.paths.some(path => (path.complex || path.filled && Math.min(...path.color.match(/../g).map(channel => parseInt(channel, 16))) < 225 && path.width * path.height < tableBox(table).width * tableBox(table).height * 0.8) && path.width > 2 && path.height > 2 && inside(tableBox(table), path.x + path.width / 2, path.y + path.height / 2)));
      fillTables(tables, items);
      const figures = figureRegions(drawings.paths, drawings.images, tables, items, viewport.width, viewport.height);
      for (const figure of figures) {
        cancelled(signal);
        figure.bytes = figure.image ? await copyImage(page, figure.image, createCanvas, encodeCanvas) : await copyVectors(page, figure, createCanvas, encodeCanvas, loadImage);
        figure.method = figure.bytes ? figure.image ? "copied-image" : "copied-vector" : "rendered-graphic";
        if (!figure.bytes) {
          figure.bytes = await captureFigure(page, figure, createCanvas, encodeCanvas, signal, pdfjs);
        }
        imageBytes += figure.bytes.byteLength;
        if (imageBytes > 256 * 1024 * 1024) throw new Error("Copied graphics exceed 256 MB. Convert a smaller page range.");
      }
      pages.push({ num: number, width: viewport.width, height: viewport.height, blocks: textBlocks(items), tables, figures, text: items.map(item => item.text).join("") });
      page.cleanup();
    }
    if (!characters && !pages.some(page => page.figures.length || page.tables.length)) throw new Error("This PDF contains no extractable text or graphics.");
    return pages;
  } finally { await pdf?.destroy(); }
}

export function buildStructuredWord(pages, docx) {
  const { Document, Paragraph, TextRun, ImageRun, WpsShapeRun, VerticalAnchor, TextWrappingType, Table, TableRow, TableCell, WidthType, TableLayoutType, HeightRule, BorderStyle, SectionType } = docx;
  const float = (x, y, zIndex = 100000) => ({ zIndex, horizontalPosition: { relative: "page", offset: Math.round(x * 12700) }, verticalPosition: { relative: "page", offset: Math.round(y * 12700) }, allowOverlap: true, layoutInCell: false, wrap: { type: TextWrappingType.NONE } });
  // The library's legacy textbox options omit DrawingML wrap/overflow flags.
  // Set them explicitly so a substituted font cannot wrap or clip a source line.
  const noWrap = run => {
    const visit = node => {
      if (node?.rootKey === "wps:bodyPr") Object.assign(node.root[0].root, {
        wrap: { key: "wrap", value: "none" },
        horizontalOverflow: { key: "horzOverflow", value: "overflow" },
        verticalOverflow: { key: "vertOverflow", value: "overflow" },
      });
      if (node?.rootKey === "a:xfrm" && Number.isFinite(node.root[0]?.root?.rotation)) node.root[0].root.rotation = Math.round(node.root[0].root.rotation);
      if (Array.isArray(node?.root)) node.root.forEach(visit);
    };
    visit(run); return run;
  };
  const lineParagraph = (line, leading = line.height * 1.1) => new Paragraph({ spacing: { before: 0, after: 0, line: Math.round(leading * 20), lineRule: "exact" }, children: line.items.map((item, index) => {
    const previous = line.items[index - 1], gap = previous ? item.x - right(previous) : 0;
    return new TextRun({ text: `${previous && gap > item.size * 0.18 && !previous.text.endsWith(" ") && !item.text.startsWith(" ") ? " " : ""}${item.text}`, font: item.font, size: Math.max(2, Math.round(item.size * 2)), scale: item.wordScale, color: item.color, bold: item.bold, italics: item.italic, shading: item.shading ? { fill: item.shading } : undefined, fitText: { width: Math.max(1, Math.round(item.width * 20)) } });
  }) });
  const textPosition = block => {
    if (Math.abs(block.angle) < 0.1) return [block.x, block.y];
    const angle = block.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const width = block.width + 4, height = block.height + block.size * 0.4;
    const line = block.lines[0], ascent = line.baseline - line.y;
    return [block.x + ascent * s + (c - 1) * width / 2 - s * height / 2,
      line.baseline - ascent * c + s * width / 2 + (c - 1) * height / 2];
  };
  const tableFor = table => {
    const box = tableBox(table);
    return new Table({
      float: { horizontalAnchor: "page", verticalAnchor: "page", absoluteHorizontalPosition: Math.round(box.x * 20), absoluteVerticalPosition: Math.round(box.y * 20), overlap: "overlap" },
      width: { size: Math.round(box.width * 20), type: WidthType.DXA }, layout: TableLayoutType.FIXED,
      columnWidths: table.colPivots.slice(1).map((x, i) => Math.round((x - table.colPivots[i]) * 20)),
      borders: Object.fromEntries(["top", "bottom", "left", "right", "insideHorizontal", "insideVertical"].map(side => [side, { style: BorderStyle.SINGLE, size: 5, color: "000000" }])),
      rows: table.rows.map((row, index) => new TableRow({ cantSplit: true, height: { value: Math.round((table.rowPivots[index + 1] - table.rowPivots[index]) * 20), rule: HeightRule.EXACT }, children: row.map(cell => new TableCell({
        columnSpan: cell.colspan, rowSpan: cell.rowspan,
        width: { size: Math.round(cell.width * 20), type: WidthType.DXA }, margins: { top: cell.items.length ? Math.max(0, Math.round((Math.min(...cell.items.map(item => item.y)) - cell.minXY.y) * 20)) : 0, bottom: 0, left: cell.items.length ? Math.max(0, Math.round((Math.min(...cell.items.map(item => item.x)) - cell.minXY.x) * 20)) : 40, right: 20 },
        children: cell.items.length ? joinLines(cell.items.map(item => ({ ...item, inTable: false }))).map(line => lineParagraph(line)) : [new Paragraph({ text: "", spacing: { before: 0, after: 0, line: 20 } })],
      })) })),
    });
  };
  return new Document({ creator: "UtilityHub", keywords: "utilityhub-structured-pdf-v1", styles: { default: { document: { run: { font: "Arial", size: 20 }, paragraph: { spacing: { before: 0, after: 0 } } } } }, sections: pages.map(page => ({
    properties: { type: SectionType.NEXT_PAGE, page: { size: { width: Math.round(page.width * 20), height: Math.round(page.height * 20) }, margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 } } },
    children: [new Paragraph({ spacing: { before: 0, after: 0, line: 20 }, children: [
      ...page.figures.map((figure, index) => new ImageRun({ type: "png", data: figure.bytes, transformation: { width: figure.width * 4 / 3, height: figure.height * 4 / 3 }, floating: float(figure.x, figure.y, 1000 + index), altText: { title: "Copied PDF image or graph", description: "Copied from the original page without OCR." } })),
      ...page.blocks.map(block => noWrap(new WpsShapeRun({ type: "wps", transformation: { width: Math.max(2, block.width + 4) * 4 / 3, height: Math.max(2, block.height + block.size * 0.4) * 4 / 3, rotation: block.angle }, floating: float(...textPosition(block)),
        bodyProperties: { wrap: TextWrappingType.NONE, verticalAnchor: VerticalAnchor.TOP, margins: { top: 0, bottom: 0, left: 0, right: 0 }, noAutoFit: true },
        children: block.lines.map((line, index) => lineParagraph(line, block.lines[index + 1] ? block.lines[index + 1].baseline - line.baseline : index ? line.baseline - block.lines[index - 1].baseline : line.height * 1.1)),
      }))),
    ] }), ...page.tables.flatMap(table => [tableFor(table), new Paragraph({ text: "", spacing: { before: 0, after: 0, line: 20 } })])],
  })) });
}
