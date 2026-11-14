import { useState } from "react";
import FilePicker from "../FilePicker.jsx";
import FileResult from "../FileResult.jsx";
import useFileTool from "../../hooks/useFileTool.js";
export default function ImageTools() {
  // Displays image compression and resizing controls.
  const [files, setFiles] = useState([]),
    [format, setFormat] = useState("jpeg"),
    [quality, setQuality] = useState(80);
  const tool = useFileTool(() =>
    // Clears the selected upload files.
    setFiles([]),
  );
  function submit(event) {
    // Validates and submits this form.
    event.preventDefault();
    if (!files.length) {
      tool.setError("Choose a JPG or PNG image first.");
      return;
    }
    const data = new FormData(event.currentTarget);
    data.set("file", files[0].file);
    data.set("format", format);
    data.set("quality", String(quality));
    void tool.processFile(
      "processImage",
      data,
      `utilityhub-image.${format === "jpeg" ? "jpg" : format}`,
    );
  }
  return (
    <section className="utility-card">
      <h2>A lighter image</h2>
      <p className="utility-intro">
        Compress a JPG or PNG, or resize it for your next upload.
      </p>
      <form onSubmit={submit} className="utility-form">
        <fieldset disabled={tool.busy}>
          <FilePicker
            files={files}
            onChange={(value) => {
              // Updates the selected value.
              setFiles(value);
              tool.reset();
            }}
            onError={tool.setError}
            extensions={["jpg", "jpeg", "png"]}
            disabled={tool.busy}
          />
          <div className="utility-form-grid">
            <label className="field-label">
              Output format
              <select
                value={format}
                onChange={(event) => {
                  // Updates the selected value.
                  setFormat(event.target.value);
                  tool.reset();
                }}
              >
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
                <option value="png">PNG (lossless)</option>
              </select>
            </label>
            <label className="field-label">
              Quality: {quality}%
              <input
                type="range"
                min="10"
                max="100"
                value={quality}
                disabled={format === "png"}
                onChange={(event) => {
                  // Updates the selected value.
                  setQuality(Number(event.target.value));
                  tool.reset();
                }}
              />
            </label>
            <label className="field-label">
              Maximum width (optional)
              <input
                name="width"
                type="number"
                min="1"
                max="6000"
                step="1"
                placeholder="e.g. 1200"
                onChange={tool.reset}
              />
            </label>
            <label className="field-label">
              Maximum height (optional)
              <input
                name="height"
                type="number"
                min="1"
                max="6000"
                step="1"
                placeholder="e.g. 800"
                onChange={tool.reset}
              />
            </label>
          </div>
          <button className="button" disabled={tool.busy}>
            {tool.busy ? "Processing…" : "Compress / resize image"}
          </button>
        </fieldset>
      </form>
      <FileResult tool={tool} label="image" />
      {tool.result?.width && (
        <p className="utility-help">
          Output dimensions: {tool.result.width} × {tool.result.height} pixels.
        </p>
      )}
      <p className="utility-help">
        JPG/PNG input, up to 80 MB and 40 megapixels. Aspect ratio is preserved;
        images are never enlarged. Leave dimensions empty to keep the original
        size. Metadata is removed. Transparent pixels become white in JPEG. PNG
        uses lossless compression, so the quality slider does not apply. Smaller
        files are not guaranteed.
      </p>
    </section>
  );
}
