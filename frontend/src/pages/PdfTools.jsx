import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileImage,
  FileText,
  Files,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  Shrink,
} from "lucide-react";
import FilePicker from "../components/FilePicker.jsx";
import FileResult from "../components/FileResult.jsx";
import useFileTool from "../hooks/useFileTool.js";
import usePageTitle from "../hooks/usePageTitle.js";
import useProgramStatus from "../hooks/useProgramStatus.js";
import { fileForm, MAX_PDF_PAGES } from "../utils/files.js";
const modes = [
  {
    id: "compress",
    title: "Compress",
    icon: Shrink,
  },
  {
    id: "merge",
    title: "Merge",
    icon: Files,
  },
  {
    id: "split",
    title: "Split",
    icon: Scissors,
  },
  {
    id: "images",
    title: "Images to PDF",
    icon: FileImage,
  },
  {
    id: "text",
    title: "Text to PDF",
    icon: FileText,
  },
];
const tips = {
  compress: [
    "Low keeps more image detail. High makes image-heavy PDFs smaller.",
    "Some PDFs are already optimized. If processing makes the file larger, you receive the original.",
    "Compression can change image quality and document metadata. Keep your original copy.",
  ],
  merge: [
    "Add at least two PDFs, then drag the rows into the order you want.",
    "The up/down arrows provide the same ordering controls on a phone.",
    "All pages from the first file come before the pages from the next file.",
  ],
  split: [
    "Use page numbers starting at 1. Example: 1-3, 5, 8-10.",
    "Pages follow the order you enter. Repeated pages are included only once.",
    "The result is a single PDF containing your chosen pages.",
  ],
  images: [
    "Each JPG or PNG becomes one page in the PDF.",
    "Images fit the page without cropping. Wide images use a landscape page.",
    "Drag or use the arrow buttons to change the image order.",
  ],
  text: [
    "Paste notes, a short report, or other plain text.",
    "Long lines and URLs wrap automatically across pages.",
    "The bundled font supports many common characters. Unsupported characters show a helpful error.",
  ],
};
function FormShell({ title, description, tool, children, onSubmit, button }) {
  // Displays shared PDF form and result controls.
  return (
    <form className="file-form" onSubmit={onSubmit} noValidate>
      <div className="file-form-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <fieldset disabled={tool.busy}>
        {children}
        <button
          className="button file-submit"
          type="submit"
          disabled={tool.busy}
        >
          {tool.busy ? "Working…" : button}
          <ArrowRight size={17} />
        </button>
      </fieldset>
      <FileResult tool={tool} />
    </form>
  );
}
function CompressForm({ status }) {
  // Displays the PDF compression form.
  const [files, setFiles] = useState([]);
  const [level, setLevel] = useState("medium");
  const tool = useFileTool(() =>
    // Clears the selected upload files.
    setFiles([]),
  );
  const change = (next) => {
    // Changes selected files and clears the result.
    setFiles(next);
    tool.reset();
  };
  function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (!files.length) return tool.setError("Choose a PDF to compress.");
    const form = fileForm(files);
    form.append("level", level);
    tool.processFile("compressPdf", form, "compressed.pdf");
  }
  return (
    <FormShell
      title="A smaller PDF. A little less hassle."
      description="Choose a file and compression level. Offline compression optimizes PDF structure and may save less space; levels apply online."
      tool={tool}
      onSubmit={submit}
      button="Compress PDF"
    >
      <FilePicker
        files={files}
        onChange={change}
        onError={tool.setError}
        extensions={["pdf"]}
        disabled={tool.busy}
      />
      <fieldset className="compression-options">
        <legend>Compression level</legend>
        <div>
          {[
            {
              value: "low",
              label: "Low",
              detail: "Higher quality",
            },
            {
              value: "medium",
              label: "Medium",
              detail: "A balanced choice",
            },
            {
              value: "high",
              label: "High",
              detail: "Smaller image files",
            },
          ].map((option) => (
            // Builds a value for each item.
            <label
              key={option.value}
              className={level === option.value ? "chosen" : ""}
            >
              <input
                type="radio"
                name="compression-level"
                value={option.value}
                checked={level === option.value}
                onChange={() => {
                  // Updates the selected value.
                  setLevel(option.value);
                  tool.reset();
                }}
              />
              <b>{option.label}</b>
              <small>{option.detail}</small>
              {level === option.value && <Check size={14} />}
            </label>
          ))}
        </div>
      </fieldset>
      {status?.ghostscript === false && (
        <p className="dependency-note">
          Ghostscript is not available on the backend. Install it or check
          GHOSTSCRIPT_BIN in backend/.env.
        </p>
      )}
    </FormShell>
  );
}
function MergeForm() {
  // Displays the PDF ordering and merging form.
  const [files, setFiles] = useState([]);
  const tool = useFileTool(() =>
    // Clears the selected upload files.
    setFiles([]),
  );
  function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (files.length < 2)
      return tool.setError("Choose at least two PDF files.");
    tool.processFile("mergePdfs", fileForm(files, true), "merged.pdf");
  }
  return (
    <FormShell
      title="Bring your PDFs together."
      description="Add your files, arrange them, and download one document."
      tool={tool}
      onSubmit={submit}
      button="Merge PDFs"
    >
      <FilePicker
        files={files}
        onChange={(next) => {
          // Updates the selected value.
          setFiles(next);
          tool.reset();
        }}
        onError={tool.setError}
        extensions={["pdf"]}
        multiple
        reorder
        disabled={tool.busy}
      />
    </FormShell>
  );
}
function SplitForm() {
  // Displays selected-page extraction controls.
  const [files, setFiles] = useState([]);
  const [ranges, setRanges] = useState("");
  const tool = useFileTool(() => {
    // Clears the uploaded PDF and page ranges.
    setFiles([]);
    setRanges("");
  });
  function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (!files.length) return tool.setError("Choose a PDF first.");
    if (!ranges.trim())
      return tool.setError("Enter the pages you want to extract.");
    const form = fileForm(files);
    form.append("ranges", ranges);
    tool.processFile("splitPdf", form, "selected-pages.pdf");
  }
  return (
    <FormShell
      title="Just the pages you need."
      description="Extract selected pages into a fresh PDF."
      tool={tool}
      onSubmit={submit}
      button="Extract pages"
    >
      <FilePicker
        files={files}
        onChange={(next) => {
          // Updates the selected value.
          setFiles(next);
          tool.reset();
        }}
        onError={tool.setError}
        extensions={["pdf"]}
        disabled={tool.busy}
      />
      <div className="file-field">
        <label htmlFor="page-ranges">Page ranges</label>
        <input
          id="page-ranges"
          value={ranges}
          onChange={(event) => {
            // Updates the selected value.
            setRanges(event.target.value);
            tool.reset();
          }}
          placeholder="For example: 1-3, 5"
          maxLength={2000}
          required
          aria-describedby="ranges-hint"
        />
        <small id="ranges-hint">
          Separate pages with commas. Use a hyphen for a range.
        </small>
      </div>
    </FormShell>
  );
}
function ImagesForm() {
  // Displays image-to-PDF creation controls.
  const [files, setFiles] = useState([]);
  const tool = useFileTool(() =>
    // Clears the selected upload files.
    setFiles([]),
  );
  function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (!files.length)
      return tool.setError("Choose at least one JPG or PNG image.");
    tool.processFile("imagesToPdf", fileForm(files, true), "images.pdf");
  }
  return (
    <FormShell
      title="Your images, in one PDF."
      description="Add JPG or PNG images in the order you want them to appear."
      tool={tool}
      onSubmit={submit}
      button="Create PDF"
    >
      <FilePicker
        files={files}
        onChange={(next) => {
          // Updates the selected value.
          setFiles(next);
          tool.reset();
        }}
        onError={tool.setError}
        extensions={["jpg", "jpeg", "png"]}
        multiple
        reorder
        disabled={tool.busy}
      />
    </FormShell>
  );
}
function TextForm() {
  // Displays typed-text PDF creation controls.
  const [text, setText] = useState("");
  const tool = useFileTool(() =>
    // Clears the submitted document text.
    setText(""),
  );
  function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (!text.trim()) return tool.setError("Type or paste some text first.");
    tool.processFile(
      "textToPdf",
      {
        text,
      },
      "text-document.pdf",
    );
  }
  return (
    <FormShell
      title="From a few words to a PDF."
      description="Type or paste your text. We’ll take care of the page breaks."
      tool={tool}
      onSubmit={submit}
      button="Create PDF"
    >
      <div className="file-field text-pdf-field">
        <label htmlFor="pdf-text">Your text</label>
        <textarea
          id="pdf-text"
          value={text}
          onChange={(event) => {
            // Updates the selected value.
            setText(event.target.value);
            tool.reset();
          }}
          placeholder="Type your notes or paste some text here…"
          maxLength={100000}
          rows={12}
          required
        />
        <small>
          {text.length.toLocaleString("en-IN")} / 100,000 characters · Plain
          text with automatic wrapping
        </small>
      </div>
    </FormShell>
  );
}
export default function PdfTools() {
  // Displays the PDF tools and selected tab.
  usePageTitle("PDF studio");
  const [params, setParams] = useSearchParams();
  const requested = params.get("tool");
  const active = modes.some(
    (mode) =>
      // Checks which items match the condition.
      mode.id === requested,
  )
    ? requested
    : "compress";
  const status = useProgramStatus();
  function select(id) {
    // Switches the active PDF tool.
    setParams(
      {
        tool: id,
      },
      {
        replace: true,
      },
    );
  }
  function keyNavigation(event, index) {
    // Moves between PDF tabs with arrow keys.
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % modes.length;
    if (event.key === "ArrowLeft")
      next = (index + modes.length - 1) % modes.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = modes.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      select(modes[next].id);
      document.getElementById(`pdf-tab-${modes[next].id}`)?.focus();
    }
  }
  return (
    <section className="document-page shell">
      <Link className="text-link document-back" to="/#tools">
        <ArrowLeft size={15} /> All tools
      </Link>
      <div className="document-heading">
        <div>
          <div className="eyebrow">
            <span className="status-dot" /> YOUR DOCUMENT TOOLKIT
          </div>
          <h1>
            PDF studio<span>.</span>
          </h1>
          <p>Make a little more of your documents. No account needed.</p>
        </div>
        <Link className="text-link" to="/tools/convert">
          Document converter <ArrowRight size={16} />
        </Link>
      </div>
      <div className="pdf-tabs" role="tablist" aria-label="PDF tools">
        {modes.map(({ id, title, icon: Icon }, index) => (
          // Builds a value for each item.
          <button
            key={id}
            id={`pdf-tab-${id}`}
            role="tab"
            aria-selected={active === id}
            aria-controls={`pdf-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            onClick={() =>
              // Switches the active PDF tool.
              select(id)
            }
            onKeyDown={(event) =>
              // Moves between PDF tabs with arrow keys.
              keyNavigation(event, index)
            }
          >
            <Icon size={17} />
            {title}
          </button>
        ))}
      </div>
      <div className="document-workspace">
        <div className="document-main">
          {modes.map(({ id }) => (
            // Builds a value for each item.
            <div
              key={id}
              role="tabpanel"
              id={`pdf-panel-${id}`}
              aria-labelledby={`pdf-tab-${id}`}
              hidden={active !== id}
            >
              {id === "compress" && <CompressForm status={status} />}
              {id === "merge" && <MergeForm />}
              {id === "split" && <SplitForm />}
              {id === "images" && <ImagesForm />}
              {id === "text" && <TextForm />}
            </div>
          ))}
        </div>
        <aside className="document-sidebar">
          <div className="document-tips">
            <span className="tip-icon">
              <FileText size={22} />
            </span>
            <h2>A few handy notes</h2>
            <ol>
              {tips[active].map((tip, index) => (
                // Builds a value for each item.
                <li key={tip}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{tip}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="document-privacy">
            <ShieldCheck size={23} />
            <h3>Just passing through.</h3>
            <p>
              Uploads are removed after processing. Results are removed after
              the download response. Abandoned files are cleaned within 10
              minutes.
            </p>
            <span>
              <LockKeyhole size={12} /> No account required
            </span>
          </div>
        </aside>
      </div>
      <p className="document-limits">
        80 MB per file · 80 MB per batch · Up to 10 files and {MAX_PDF_PAGES.toLocaleString()} PDF pages ·
        Password-protected PDFs are not supported
      </p>
    </section>
  );
}
