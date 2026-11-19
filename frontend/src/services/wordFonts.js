import carlito400normal from "@fontsource/carlito/files/carlito-latin-400-normal.woff2?url";
import carlito400italic from "@fontsource/carlito/files/carlito-latin-400-italic.woff2?url";
import carlito700normal from "@fontsource/carlito/files/carlito-latin-700-normal.woff2?url";
import carlito700italic from "@fontsource/carlito/files/carlito-latin-700-italic.woff2?url";
import arimo400normal from "@fontsource/arimo/files/arimo-latin-400-normal.woff2?url";
import arimo400italic from "@fontsource/arimo/files/arimo-latin-400-italic.woff2?url";
import arimo700normal from "@fontsource/arimo/files/arimo-latin-700-normal.woff2?url";
import arimo700italic from "@fontsource/arimo/files/arimo-latin-700-italic.woff2?url";
import tinos400normal from "@fontsource/tinos/files/tinos-latin-400-normal.woff2?url";
import tinos400italic from "@fontsource/tinos/files/tinos-latin-400-italic.woff2?url";
import tinos700normal from "@fontsource/tinos/files/tinos-latin-700-normal.woff2?url";
import tinos700italic from "@fontsource/tinos/files/tinos-latin-700-italic.woff2?url";

// Local fallback fonts; embedded document fonts are appended after these.
export const wordFontCss = [
  `@font-face { font-family: "Calibri"; src: url("${carlito400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Carlito"; src: url("${carlito400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Calibri"; src: url("${carlito400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Carlito"; src: url("${carlito400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Calibri"; src: url("${carlito700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Carlito"; src: url("${carlito700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Calibri"; src: url("${carlito700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
  `@font-face { font-family: "Carlito"; src: url("${carlito700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
  `@font-face { font-family: "Arial"; src: url("${arimo400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Arimo"; src: url("${arimo400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Helvetica"; src: url("${arimo400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Arial"; src: url("${arimo400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Arimo"; src: url("${arimo400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Helvetica"; src: url("${arimo400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Arial"; src: url("${arimo700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Arimo"; src: url("${arimo700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Helvetica"; src: url("${arimo700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Arial"; src: url("${arimo700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
  `@font-face { font-family: "Arimo"; src: url("${arimo700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
  `@font-face { font-family: "Helvetica"; src: url("${arimo700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
  `@font-face { font-family: "Times New Roman"; src: url("${tinos400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Tinos"; src: url("${tinos400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Times"; src: url("${tinos400normal}") format("woff2"); font-weight: 400; font-style: normal; }`,
  `@font-face { font-family: "Times New Roman"; src: url("${tinos400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Tinos"; src: url("${tinos400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Times"; src: url("${tinos400italic}") format("woff2"); font-weight: 400; font-style: italic; }`,
  `@font-face { font-family: "Times New Roman"; src: url("${tinos700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Tinos"; src: url("${tinos700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Times"; src: url("${tinos700normal}") format("woff2"); font-weight: 700; font-style: normal; }`,
  `@font-face { font-family: "Times New Roman"; src: url("${tinos700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
  `@font-face { font-family: "Tinos"; src: url("${tinos700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
  `@font-face { font-family: "Times"; src: url("${tinos700italic}") format("woff2"); font-weight: 700; font-style: italic; }`,
].join("\n");
