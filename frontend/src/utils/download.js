// Start a normal browser download. Keep its URL alive briefly so clearing the
// form cannot interrupt the browser while it takes ownership of the file.
export function downloadFile(blob, filename) {
  // Starts a download with a short-lived browser URL.
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }
  setTimeout(
    () =>
      // Runs this step after a short delay.
      URL.revokeObjectURL(url),
    60000,
  );
}
