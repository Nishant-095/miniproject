import { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, moveTo, lineTo, closePath } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";

export async function structureFixture() {
  const canvas = createCanvas(180, 120), context = canvas.getContext("2d");
  context.fillStyle = "#33aadd"; context.fillRect(0, 0, 180, 120);
  context.fillStyle = "#ee6633"; context.fillRect(15, 15, 45, 70);
  context.fillStyle = "#225522"; context.fillRect(100, 30, 60, 40);
  const imageBytes = await canvas.encode("png");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const image = await pdf.embedPng(imageBytes);
  const page = pdf.addPage([595, 842]);
  page.drawText("ANALYSIS REPORT", { x: 40, y: 800, font: bold, size: 22, color: rgb(0.1, 0.2, 0.7) });
  for (let i = 0; i < 6; i++) {
    page.drawText(`LEFT_COLUMN_LINE_${i + 1}`, { x: 40, y: 750 - 16 * i, font: regular, size: 11 });
    page.drawText(`RIGHT_COLUMN_LINE_${i + 1}`, { x: 315, y: 750 - 16 * i, font: regular, size: 11 });
  }
  page.drawImage(image, { x: 50, y: 400, width: 180, height: 120 });
  page.drawText("OVERLAY_TEXT_STAYS_EDITABLE", { x: 55, y: 485, font: bold, size: 8 });
  page.drawText("Photo caption remains text", { x: 50, y: 380, font: regular, size: 10 });
  page.drawText("Monthly totals", { x: 315, y: 620, font: bold, size: 13 });
  for (let i = 0; i < 4; i++) {
    page.drawLine({ start: { x: 315, y: 420 + i * 50 }, end: { x: 525, y: 420 + i * 50 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
    page.drawLine({ start: { x: 315 + i * 70, y: 420 }, end: { x: 315 + i * 70, y: 570 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
  }
  page.drawRectangle({ x: 335, y: 420, width: 30, height: 60, color: rgb(0.2, 0.4, 0.9) });
  page.drawRectangle({ x: 395, y: 420, width: 30, height: 100, color: rgb(0.9, 0.3, 0.1) });
  page.drawRectangle({ x: 455, y: 420, width: 30, height: 140, color: rgb(0.1, 0.7, 0.2) });
  page.drawLine({ start: { x: 315, y: 420 }, end: { x: 525, y: 570 }, thickness: 1, color: rgb(0.5, 0.1, 0.6) });
  for (const [label, x] of [["Jan", 335], ["Feb", 395], ["Mar", 455]]) page.drawText(label, { x, y: 400, font: regular, size: 10 });
  page.drawText("PAGE ONE FOOTER", { x: 40, y: 30, font: regular, size: 8 });
  const second = pdf.addPage([842, 595]);
  second.drawText("LANDSCAPE PAGE TWO", { x: 40, y: 555, font: bold, size: 18 });
  for (const y of [500, 470, 440, 410]) second.drawLine({ start: { x: 40, y }, end: { x: 640, y }, thickness: 0.75 });
  for (const x of [40, 240, 440, 640]) second.drawLine({ start: { x, y: 410 }, end: { x, y: 500 }, thickness: 0.75 });
  for (const [value, x, y] of [["A", 50, 480], ["B", 250, 480], ["C", 450, 480], ["one", 50, 450], ["two", 250, 450], ["three", 450, 450], ["four", 50, 420]]) second.drawText(value, { x, y, font: regular, size: 11 });
  second.pushOperators(pushGraphicsState(), rectangle(665, 120, 50, 40), clip(), endPath());
  second.drawImage(image, { x: 650, y: 100, width: 100, height: 100 });
  second.drawText("CLIP_TEXT", { x: 666, y: 141, font: regular, size: 7 });
  second.pushOperators(popGraphicsState());
  second.drawImage(image, { x: 740, y: 250, width: 90, height: 60, rotate: degrees(90) });
  second.pushOperators(pushGraphicsState(), moveTo(755, 100), lineTo(815, 100), lineTo(785, 160), closePath(), clip(), endPath());
  second.drawImage(image, { x: 755, y: 100, width: 60, height: 60 });
  second.drawText("GRAPH_LABEL", { x: 767, y: 120, font: bold, size: 5 });
  second.pushOperators(popGraphicsState());
  second.drawText("ROTATED_LABEL", { x: 360, y: 300, font: regular, size: 12, rotate: degrees(35) });
  return { bytes: await pdf.save(), imageBytes };
}
