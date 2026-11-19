import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Files, ShieldCheck } from "lucide-react";
import FilePicker from "../components/FilePicker.jsx";
import FileResult from "../components/FileResult.jsx";
import useFileTool from "../hooks/useFileTool.js";
import usePageTitle from "../hooks/usePageTitle.js";
import FilePrivacy from "../components/FilePrivacy.jsx";
import { fileForm } from "../utils/files.js";
const formats = [
  {
    id: "docx-pdf",
    title: "DOCX to PDF",
    extensions: ["docx"],
    output: "pdf",
    office: true,
    help: "Convert Word text, tables and embedded JPG/PNG images on this device. UtilityHub's positioned Word exports keep their page layout; other complex Word layouts may vary.",
  },
  {
    id: "pdf-docx",
    title: "PDF to DOCX",
    extensions: ["pdf"],
    output: "docx",
    office: false,
    help: "Analyze up to 1,000 pages and copy text, columns, detected tables, images and graphs into their original page positions. Text stays editable. Images and graphs are copied without OCR; text inside scans stays part of the image. Fonts and complex layouts may vary.",
  },
  {
    id: "txt-pdf",
    title: "TXT to PDF",
    extensions: ["txt"],
    output: "pdf",
    help: "Upload a UTF-8 text file with up to 100,000 characters.",
  },
  {
    id: "image-pdf",
    title: "Image to PDF",
    extensions: ["jpg", "jpeg", "png"],
    output: "pdf",
    help: "Put a JPG or PNG on a PDF page without cropping.",
  },
];
export default function DocumentConverter() {
  // Displays document conversion choices and uploads.
  usePageTitle("Document converter");
  const [mode, setMode] = useState("docx-pdf");
  const [files, setFiles] = useState([]);
  const tool = useFileTool(() =>
    // Clears the selected upload files.
    setFiles([]),
  );
  const selected = formats.find(
    (format) =>
      // Checks which items match the condition.
      format.id === mode,
  );
  function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (!files.length) return tool.setError("Choose a file to convert.");
    const form = fileForm(files);
    form.append("format", selected.output);
    tool.processFile("convertDocument", form, `converted.${selected.output}`);
  }
  return (
    <section className="document-page shell">
      <Link className="text-link document-back" to="/#tools">
        <ArrowLeft size={15} /> All tools
      </Link>
      <div className="document-heading">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> A CHANGE OF FORMAT
          </div>
          <h1>
            Document converter<span>.</span>
          </h1>
          <p>The same useful content. A format that fits.</p>
        </div>
        <Link className="text-link" to="/tools/pdf">
          Open PDF studio <ArrowRight size={16} />
        </Link>
      </div>
      <FilePrivacy />
      <div className="document-workspace converter-workspace">
        <div className="document-main">
          <form className="file-form" onSubmit={submit} noValidate>
            <div className="file-form-heading">
              <h2>A new format, in a few steps.</h2>
              <p>
                Choose your conversion, add a file, and download the result.
              </p>
            </div>
            <fieldset disabled={tool.busy}>
              <div className="file-field conversion-select">
                <label htmlFor="conversion">Convert a document</label>
                <select
                  id="conversion"
                  value={mode}
                  onChange={(event) => {
                    // Updates the selected value.
                    setMode(event.target.value);
                    setFiles([]);
                    tool.reset();
                  }}
                >
                  {formats.map((format) => (
                    // Builds a value for each item.
                    <option key={format.id} value={format.id}>
                      {format.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="conversion-flow">
                <span>
                  {selected.extensions
                    .map((ext) =>
                      // Builds a value for each item.
                      ext.toUpperCase(),
                    )
                    .join(" / ")}
                </span>
                <ArrowRight size={20} />
                <span>{selected.output.toUpperCase()}</span>
              </div>
              <FilePicker
                files={files}
                onChange={(next) => {
                  // Updates the selected value.
                  setFiles(next);
                  tool.reset();
                }}
                onError={tool.setError}
                extensions={selected.extensions}
                disabled={tool.busy}
              />
              <p className="conversion-detail">{selected.help}</p>
              <button
                type="submit"
                className="button file-submit"
                disabled={tool.busy}
              >
                {tool.busy
                  ? "Converting…"
                  : `Convert to ${selected.output.toUpperCase()}`}
                <ArrowRight size={17} />
              </button>
            </fieldset>
            <FileResult tool={tool} />
          </form>
        </div>
        <aside className="document-sidebar">
          <div className="document-tips">
            <span className="tip-icon">
              <Files size={23} />
            </span>
            <h2>Four useful conversions</h2>
            <ol>
              {formats.map((format, index) => (
                // Builds a value for each item.
                <li key={format.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>
                    <strong>{format.title}</strong>
                    <br />
                    {format.id === "pdf-docx" ? "Page structure, editable text, tables and graphics."
                      : format.office ? "Word conversion with table support."
                      : "Created with pdf-lib."}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div className="document-privacy">
            <ShieldCheck size={23} />
            <h3>Your files stay yours.</h3>
            <p>
              PDF structure is read directly, without slow OCR. Text, tables and
              graphics keep their page positions. Every conversion runs on
              this device, including in the installed app. Check unusual fonts and complex layouts.
            </p>
          </div>
        </aside>
      </div>
      <p className="document-limits">
        80 MB maximum file size · UTF-8 text support · Word/PDF layout may vary ·
        No OCR for scanned documents · Complex layouts may vary
      </p>
    </section>
  );
}
