export const MAX_FILE_SIZE = 80 * 1024 * 1024;
export const MAX_BATCH_SIZE = 80 * 1024 * 1024;
export const MAX_PDF_PAGES = 1000;
export function formatBytes(bytes) {
  // Formats a byte count for display.
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
export function fileForm(files, multiple = false) {
  // Puts the selected files into FormData.
  const form = new FormData();
  files.forEach((item) =>
    // Appends a selected file to FormData.
    form.append(multiple ? "files" : "file", item.file),
  );
  return form;
}

// Shared size validation for upload forms.
export function uploadSizeError(files) {
  // Checks per-file and combined upload sizes.
  if (
    files.some(
      (file) =>
        // Checks which items match the condition.
        file.size > MAX_FILE_SIZE,
    )
  )
    return `Each file must be ${MAX_FILE_SIZE / 1024 / 1024} MB or smaller.`;
  if (
    files.reduce(
      (sum, file) =>
        // Combines the items into one value.
        sum + file.size,
      0,
    ) > MAX_BATCH_SIZE
  )
    return `Selected files must total ${MAX_BATCH_SIZE / 1024 / 1024} MB or less.`;
  return "";
}
