import { useEffect, useRef, useState } from "react";
import sendAction from "../services/server.js";
import { useToast } from "../context/ToastContext.jsx";
import { downloadFile } from "../utils/download.js";
export default function useFileTool(onDownload) {
  // Manages processing, downloading, and form cleanup.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const request = useRef(null);
  const notify = useToast();
  useEffect(
    () =>
      // Cancels processing when the form closes.
      () => {
        // Cancels processing when the form closes.
        request.current?.abort();
      },
    [],
  );
  function reset() {
    // Clears the previous result and error.
    setError("");
    setResult(null);
  }
  function download() {
    // Starts the download and clears the form.
    if (!result) return;
    try {
      downloadFile(result.blob, result.filename);
      reset();
      onDownload?.();
      notify("Download started. The form has been cleared.");
    } catch {
      notify("Could not start the download. Please try again.");
    }
  }
  async function processFile(action, payload, filename) {
    // Sends a file action and stores its result.
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    reset();
    setBusy(true);
    try {
      let response;
      if (navigator.onLine === false) {
        const { processOfflineFile } = await import("../services/offlineFiles.js");
        response = await processOfflineFile(action, payload, { signal: controller.signal });
      } else {
        try {
          response = await sendAction(action, payload, {
            responseType: "blob",
            timeout: action === "convertDocument" ? 300000 : 150000,
            signal: controller.signal,
          });
        } catch (error) {
          if (!(error instanceof TypeError) || controller.signal.aborted) throw error;
          const { processOfflineFile } = await import("../services/offlineFiles.js");
          response = await processOfflineFile(action, payload, { signal: controller.signal });
        }
      }
      const { data, headers } = response;
      const original = Number(headers["x-original-size"]);
      const compressed = Number(headers["x-compressed-size"]);
      setResult({
        blob: data,
        filename,
        size: data.size,
        width: Number(headers["x-image-width"]) || null,
        height: Number(headers["x-image-height"]) || null,
        stats:
          Number.isFinite(original) && Number.isFinite(compressed)
            ? {
                original,
                compressed,
                saved: Number(headers["x-saved-percent"]),
                unchanged: headers["x-compression-result"] === "unchanged",
              }
            : null,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err.message || "Could not process this file. Please try again.";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }
  return {
    busy,
    error,
    result,
    reset,
    setError,
    processFile,
    download,
  };
}
