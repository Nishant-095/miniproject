// Browser layout gives us the actual height of Word content after fonts load.
// Move whole blocks first, split table rows or long paragraphs only when needed.
export function paginateWordPages(container, maxPages, checkCancelled) {
  const sources = [...container.querySelectorAll(":scope > section.uh-word")];
  const result = [];
  for (const source of sources) {
    checkCancelled();
    const win = source.ownerDocument.defaultView, css = win.getComputedStyle(source);
    const pageHeight = parseFloat(css.minHeight), pageWidth = source.getBoundingClientRect().width;
    if (!(pageHeight > 0 && pageHeight <= 30000 && pageWidth > 0 && pageWidth <= 30000)) throw new Error("This Word document has invalid or excessively large page dimensions.");
    const articles = [...source.querySelectorAll(":scope > article")];
    if (!articles.length) continue;
    let page, article;
    const newPage = () => {
      if (result.length >= maxPages) throw new Error(`This Word document produces more than ${maxPages} PDF pages.`);
      page = source.cloneNode(false);
      page.style.height = `${pageHeight}px`; page.style.minHeight = `${pageHeight}px`; page.style.flexShrink = "0";
      const header = source.querySelector(":scope > header"), footer = source.querySelector(":scope > footer");
      if (header) page.appendChild(header.cloneNode(true));
      article = articles[0].cloneNode(false); article.style.flexShrink = "0"; page.appendChild(article);
      if (footer) { const copy = footer.cloneNode(true); copy.style.flexShrink = "0"; page.appendChild(copy); }
      container.appendChild(page); result.push({ element: page, width: pageWidth, height: pageHeight });
    };
    const bottom = () => {
      const footer = page.querySelector(":scope > footer");
      const footerCss = footer && win.getComputedStyle(footer);
      const footprint = footer ? Math.max(0, footer.getBoundingClientRect().height + (parseFloat(footerCss.marginTop) || 0) + (parseFloat(footerCss.marginBottom) || 0)) : 0;
      return page.getBoundingClientRect().top + pageHeight - parseFloat(css.paddingBottom) - footprint;
    };
    const fits = () => {
      const last = article.lastElementChild;
      if (!last) return true;
      const rect = last.getBoundingClientRect(), margin = parseFloat(win.getComputedStyle(last).marginBottom) || 0;
      return rect.bottom + Math.max(0, margin) <= bottom() + 1;
    };
    newPage();
    function appendBlock(node) {
      checkCancelled();
      const hadContent = Boolean(article.children.length);
      article.appendChild(node);
      if (fits()) return;
      node.remove();
      if (hadContent) { newPage(); article.appendChild(node); if (fits()) return; node.remove(); }
      if (node.tagName === "TABLE") return splitTable(node);
      if (node.tagName === "P" && node.textContent.trim() && !node.querySelector("img, svg")) return splitParagraph(node);
      throw new Error("A Word object is taller than one page. Reduce its size in Word so it can be converted without clipping.");
    }
    function splitTable(table) {
      const rows = [...table.rows];
      const template = table.cloneNode(true); [...template.querySelectorAll("tr")].forEach(row => row.remove());
      let part, body;
      const start = () => { part = template.cloneNode(true); body = part.querySelector("tbody") || part; article.appendChild(part); };
      start();
      for (let index = 0; index < rows.length;) {
        // A vertical merge stays together on one page.
        let end = index + 1;
        for (let r = index; r < end; r++) for (const cell of rows[r].cells) end = Math.max(end, Math.min(rows.length, r + (cell.rowSpan || 1)));
        const group = rows.slice(index, end);
        group.forEach(row => body.appendChild(row));
        if (!fits()) {
          group.forEach(row => row.remove());
          if (!part.rows.length) part.remove();
          if (!article.children.length) throw new Error("A Word table row or merged cell is taller than one page. Reduce its height in Word to avoid losing content.");
          newPage(); start(); group.forEach(row => body.appendChild(row));
          if (!fits()) throw new Error("A Word table row or merged cell is taller than one page. Reduce its height in Word to avoid losing content.");
        }
        index = end;
      }
    }
    function splitParagraph(paragraph) {
      const doc = source.ownerDocument;
      const walker = doc.createTreeWalker(paragraph, 4), nodes = [];
      while (walker.nextNode()) if (walker.currentNode.textContent.length) nodes.push(walker.currentNode);
      const total = nodes.reduce((sum, node) => sum + node.length, 0);
      function point(offset) {
        for (const node of nodes) { if (offset <= node.length) return [node, offset]; offset -= node.length; }
        return [nodes[nodes.length - 1], nodes[nodes.length - 1].length];
      }
      function fragment(start, end) {
        const range = doc.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
        const p = paragraph.cloneNode(false); p.appendChild(range.cloneContents());
        if (start) { p.style.marginTop = "0"; p.style.textIndent = "0"; }
        if (end < total) p.style.marginBottom = "0";
        return p;
      }
      let offset = 0;
      while (offset < total) {
        checkCancelled();
        let low = offset + 1, high = total, best = offset;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2), candidate = fragment(offset, middle);
          article.appendChild(candidate); const okay = fits(); candidate.remove();
          if (okay) { best = middle; low = middle + 1; } else high = middle - 1;
        }
        if (best === offset) throw new Error("A Word paragraph cannot fit inside its page margins. Adjust the document margins in Word.");
        if (best < total) {
          const value = paragraph.textContent;
          const space = value.lastIndexOf(" ", best - 1);
          if (space > offset && best - space < 60) best = space + 1;
        }
        article.appendChild(fragment(offset, best)); offset = best;
        if (offset < total) newPage();
      }
    }
    for (const original of articles) {
      const children = [...original.children];
      for (let i = 0; i < children.length;) {
        const group = [children[i++].cloneNode(true)];
        while (group.at(-1).dataset.keepNext === "true" && i < children.length) group.push(children[i++].cloneNode(true));
        if (group.length > 1 && article.children.length) {
          group.forEach(node => article.appendChild(node));
          const together = fits(); group.forEach(node => node.remove());
          if (!together) newPage();
        }
        group.forEach(appendBlock);
      }
    }
    // Footnotes remain content, rather than silently disappearing during pagination.
    for (const note of [...source.children].filter(node => !["ARTICLE", "HEADER", "FOOTER"].includes(node.tagName))) appendBlock(note.cloneNode(true));
    source.remove();
  }
  return result;
}
