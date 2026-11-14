import fs from "node:fs/promises";
import { PDFDocument, PageSizes, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { httpError } from "../utils/httpError.js";
const currency = (paise) =>
  // Formats expense report amounts in rupees.
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
const payment = (value) =>
  // Formats a stored payment method label.
  value === "upi"
    ? "UPI"
    : value.replace(/\b\w/g, (letter) =>
        // Capitalizes the payment method label.
        letter.toUpperCase(),
      );
export function csvCell(value) {
  // Escapes a value for safe CSV export.
  let text = String(value ?? "");
  // Quote every cell and make formula-like text explicit spreadsheet text.
  if (
    /^[\s\u0000-\u001f]*[=+@\-＝＋＠－]/u.test(text) ||
    /^[\t\r\n]/.test(text)
  )
    text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function expensesCsv(expenses) {
  // Creates all monthly expense rows as CSV.
  const rows = [
    ["Date", "Amount (INR)", "Category", "Note", "Payment method"],
    ...expenses.map((item) =>
      // Builds a value for each item.
      [
        item.date,
        (item.amountPaise / 100).toFixed(2),
        item.category,
        item.note,
        payment(item.paymentMethod),
      ],
    ),
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        // Builds a value for each item.
        row.map(csvCell).join(","),
      )
      .join("\r\n")
  );
}
function wrap(text, font, size, width) {
  // Wraps report text to fit a column.
  const lines = [];
  for (const paragraph of String(text).replace(/\t/g, "    ").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) {
        lines.push(line);
        line = "";
      }
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      line += " ";
    }
    lines.push(line.trimEnd());
  }
  return lines.length ? lines : [""];
}
export async function expensesPdf(expenses, user, summary) {
  // Creates a paginated monthly expense PDF.
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const bytes = await fs.readFile(
    new URL("../assets/fonts/DejaVuSans.ttf", import.meta.url),
  );
  const font = await pdf.embedFont(bytes, {
    subset: true,
  });
  const supported = new Set(font.getCharacterSet());
  const strings = [
    user.name,
    user.email,
    ...expenses.flatMap((item) =>
      // Builds a value for each item.
      [item.note, item.category],
    ),
  ];
  if (
    strings.some((text) =>
      // Checks which items match the condition.
      [...text].some(
        (char) =>
          // Checks which items match the condition.
          !["\n", "\t"].includes(char) && !supported.has(char.codePointAt(0)),
      ),
    )
  )
    throw httpError(
      422,
      "Some characters cannot be displayed by the PDF font. Export CSV to preserve the full text.",
    );
  pdf.setTitle(`UtilityHub expenses ${summary.month}`);
  pdf.setAuthor("UtilityHub");
  const [width, height] = PageSizes.A4;
  const margin = 40;
  const widths = [64, 76, 73, 88, width - margin * 2 - 301];
  const xs = widths.map(
    (_, index) =>
      // Builds a value for each item.
      margin +
      widths.slice(0, index).reduce(
        (sum, value) =>
          // Combines the items into one value.
          sum + value,
        0,
      ),
  );
  const ink = rgb(0.25, 0.22, 0.32);
  const muted = rgb(0.52, 0.48, 0.59);
  const purple = rgb(0.39, 0.35, 0.82);
  let page;
  let y;
  const draw = (text, x, baseline, size = 8.5, color = ink) =>
    // Draws report text at the chosen position.
    page.drawText(String(text), {
      x,
      y: baseline,
      font,
      size,
      color,
    });
  function header(first = false) {
    // Draws the report header and column labels.
    page = pdf.addPage(PageSizes.A4);
    draw("UtilityHub", margin, height - 43, 15, purple);
    const caption = `EXPENSES / ${summary.month}`;
    draw(
      caption,
      width - margin - font.widthOfTextAtSize(caption, 8),
      height - 41,
      8,
      muted,
    );
    page.drawLine({
      start: {
        x: margin,
        y: height - 57,
      },
      end: {
        x: width - margin,
        y: height - 57,
      },
      thickness: 0.6,
      color: rgb(0.89, 0.87, 0.94),
    });
    y = height - 82;
    if (first) {
      draw("Monthly expense report", margin, y, 18);
      y -= 24;
      // Wrapping also supports a long account name or email without clipping.
      for (const line of wrap(
        `${user.name} | ${user.email}`,
        font,
        9,
        width - margin * 2,
      )) {
        draw(line, margin, y, 9, muted);
        y -= 13;
      }
      y -= 17;
      const cardWidth = (width - margin * 2 - 20) / 3;
      const cards = [
        ["TOTAL SPENT", currency(summary.totalPaise)],
        [
          "OVERALL BUDGET",
          summary.budget.overallPaise === null
            ? "Not set"
            : currency(summary.budget.overallPaise),
        ],
        [
          "REMAINING",
          summary.remainingPaise === null
            ? "Not set"
            : currency(summary.remainingPaise),
        ],
      ];
      cards.forEach(([label, value], index) => {
        // Draws one monthly summary card.
        const x = margin + index * (cardWidth + 10);
        page.drawRectangle({
          x,
          y: y - 46,
          width: cardWidth,
          height: 58,
          color: rgb(0.97, 0.96, 0.99),
          borderColor: rgb(0.91, 0.88, 0.96),
          borderWidth: 0.5,
        });
        draw(label, x + 10, y - 2, 7, muted);
        const size = Math.min(
          12,
          ((cardWidth - 20) / font.widthOfTextAtSize(value, 12)) * 12,
        );
        draw(value, x + 10, y - 25, size, purple);
      });
      y -= 68;
      draw(
        `${expenses.length} entries | INR | Full month, all categories`,
        margin,
        y,
        8,
        muted,
      );
      y -= 21;
    }
    page.drawRectangle({
      x: margin,
      y: y - 7,
      width: width - margin * 2,
      height: 24,
      color: purple,
    });
    ["Date", "Category", "Payment", "Amount (INR)", "Note"].forEach(
      (label, index) =>
        // Draws a report column heading.
        draw(label, xs[index] + 6, y + 1, 8, rgb(1, 1, 1)),
    );
    y -= 7;
  }
  header(true);
  for (const [index, expense] of expenses.entries()) {
    const cells = [
      expense.date,
      expense.category,
      payment(expense.paymentMethod),
      currency(expense.amountPaise),
      expense.note || "-",
    ];
    const lines = cells.map((text, column) =>
      // Builds a value for each item.
      wrap(text, font, 8, widths[column] - 12),
    );
    const rowHeight =
      Math.max(
        ...lines.map(
          (values) =>
            // Builds a value for each item.
            values.length,
        ),
      ) *
        12 +
      16;
    if (y - rowHeight < 52) header();
    if (index % 2 === 0)
      page.drawRectangle({
        x: margin,
        y: y - rowHeight,
        width: width - margin * 2,
        height: rowHeight,
        color: rgb(0.975, 0.972, 0.987),
      });
    lines.forEach((values, column) =>
      // Draws each column's wrapped text.
      values.forEach((line, lineIndex) => {
        // Draws a report line with amount alignment.
        const x =
          column === 3
            ? xs[column] + widths[column] - 6 - font.widthOfTextAtSize(line, 8)
            : xs[column] + 6;
        draw(line, x, y - 15 - lineIndex * 12, 8);
      }),
    );
    y -= rowHeight;
    page.drawLine({
      start: {
        x: margin,
        y,
      },
      end: {
        x: width - margin,
        y,
      },
      thickness: 0.4,
      color: rgb(0.92, 0.91, 0.95),
    });
  }
  if (!expenses.length) {
    draw("No expenses recorded for this month.", margin + 7, y - 30, 10, muted);
    y -= 48;
  }
  if (y - 40 < 52) header();
  y -= 28;
  draw("MONTH TOTAL", margin + 6, y, 9, purple);
  const total = currency(summary.totalPaise);
  draw(
    total,
    width - margin - font.widthOfTextAtSize(total, 11),
    y,
    11,
    purple,
  );
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    // Adds the report footer and page numbers.
    item.drawText(`UtilityHub | ${summary.month} | Private report`, {
      x: margin,
      y: 25,
      font,
      size: 7,
      color: muted,
    });
    const number = `Page ${index + 1} of ${pages.length}`;
    item.drawText(number, {
      x: width - margin - font.widthOfTextAtSize(number, 7),
      y: 25,
      font,
      size: 7,
      color: muted,
    });
  });
  return Buffer.from(await pdf.save());
}
