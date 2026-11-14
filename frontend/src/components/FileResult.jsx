import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
} from "lucide-react";
import { formatBytes } from "../utils/files.js";
export default function FileResult({ tool, label = "document" }) {
  // Displays processing, errors, and the download button.
  if (tool.busy)
    return (
      <div className="file-processing" role="status" aria-live="polite">
        <div>
          <LoaderCircle size={17} className="spin" />
          <b>Processing your {label}…</b>
        </div>
        <progress aria-label={`Processing ${label}`} />
        <p>Large documents may take several minutes. Keep this page open.</p>
      </div>
    );
  if (tool.error)
    return (
      <div className="file-error" role="alert">
        <AlertCircle size={18} />
        <span>{tool.error}</span>
      </div>
    );
  if (!tool.result) return null;
  const { result } = tool;
  return (
    <div className="file-result" role="status">
      <div className="file-result-title">
        <CheckCircle2 size={21} />
        <div>
          <b>Your {label} is ready.</b>
          <p>
            {result.filename} · {formatBytes(result.size)}
          </p>
        </div>
      </div>
      {result.stats && (
        <>
          <div className="compression-stats">
            <div>
              <span>Original</span>
              <b>{formatBytes(result.stats.original)}</b>
            </div>
            <div>
              <span>Result</span>
              <b>{formatBytes(result.stats.compressed)}</b>
            </div>
            <div>
              <span>Saved</span>
              <b>{result.stats.saved.toFixed(1)}%</b>
            </div>
          </div>
          {result.stats.unchanged && (
            <p className="compression-note">
              This file is already compact. We kept the original because the
              processed file was larger.
            </p>
          )}
        </>
      )}
      {result.stats?.saved < 0 && (
        <p className="compression-note">
          This output is larger than the original. Try a lower JPEG/WebP quality
          or smaller dimensions.
        </p>
      )}
      <button
        type="button"
        className="button download-button"
        onClick={tool.download}
      >
        <Download size={17} /> Download{" "}
        {result.filename.split(".").pop().toUpperCase()}
      </button>
    </div>
  );
}
