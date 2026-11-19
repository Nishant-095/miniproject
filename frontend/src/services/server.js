export const TOKEN_KEY = "utilityhub_token";
const serverUrl = (
  import.meta.env?.VITE_SERVER_URL || "http://localhost:5000"
).replace(/\/$/, "");

// Account actions send JSON; file actions stay in this browser.
async function onlineAction(action, fields = {}, options = {}) {
  // Sends one named action to Express.
  if (fields instanceof FormData || fields instanceof Blob) {
    throw new Error("Files are processed on your device and cannot be sent to the server.");
  }
  const controller = new AbortController();
  const cancel = () =>
    // Cancels the current server request.
    controller.abort();
  if (options.signal?.aborted) cancel();
  options.signal?.addEventListener("abort", cancel, {
    once: true,
  });
  let timedOut = false;
  // A sleeping free backend can take about a minute to wake up.
  const timer = setTimeout(() => {
    // Runs this step after a short delay.
    timedOut = true;
    cancel();
  }, options.timeout || (import.meta.env?.PROD ? 90000 : 15000));
  try {
    const headers = {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    headers["Content-Type"] = "application/json";
    const response = await fetch(
      `${serverUrl}/server?action=${encodeURIComponent(action)}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(fields),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      let message = "The server could not complete this action.";
      try {
        message = (await response.json()).message || message;
      } catch {
        /* No JSON body. */
      }
      const error = new Error(message);
      error.status = response.status;
      if (error.status === 401 && !["login", "register"].includes(action)) {
        window.dispatchEvent(new Event("utilityhub:unauthorized"));
      }
      throw error;
    }
    const data =
      options.responseType === "blob"
        ? await response.blob()
        : await response.json();
    return {
      data,
      headers: Object.fromEntries(response.headers),
    };
  } catch (error) {
    if (timedOut)
      throw new Error(
        "The account server took too long. Please try again.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

const publicActions = new Set(["login", "register", "programStatus", "serverHealth"]);
const fileActions = new Set(["compressPdf", "mergePdfs", "splitPdf", "imagesToPdf", "textToPdf", "convertDocument", "processImage"]);
const changedActions = /^(create|update|delete|saveBudget|readNotification|readAllNotifications)/;
async function syncForUser(user, syncWorkspace, currentOfflineUser) {
  const originalToken = localStorage.getItem(TOKEN_KEY);
  await syncWorkspace(user.id, (action, fields) => {
    if (!originalToken || localStorage.getItem(TOKEN_KEY) !== originalToken || currentOfflineUser()?.id !== user.id) {
      throw new Error("Account changed while offline edits were syncing. Sign in to that account to continue.");
    }
    return onlineAction(action, fields);
  });
}
export async function prepareOfflineWorkspace() {
  const { currentOfflineUser, syncWorkspace } = await import("./offlineWorkspace.js");
  const user = currentOfflineUser();
  if (!user || navigator.onLine === false) return;
  try { await syncForUser(user, syncWorkspace, currentOfflineUser); }
  catch (error) {
    window.dispatchEvent(new CustomEvent("utilityhub:sync-status", { detail: { error: "Could not sync or prepare the offline workspace. Check the server and try again.", pending: true } }));
    throw error;
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { void prepareOfflineWorkspace().catch(() => {}); });
  const retryPending = async () => {
    if (navigator.onLine === false || !localStorage.getItem(TOKEN_KEY)) return;
    const { currentOfflineUser, hasPendingChanges } = await import("./offlineWorkspace.js");
    const user = currentOfflineUser();
    if (user && await hasPendingChanges(user.id)) await prepareOfflineWorkspace();
  };
  window.addEventListener("focus", () => { void retryPending().catch(() => {}); });
  window.setInterval(() => { void retryPending().catch(() => {}); }, 30000);
}
export default async function sendAction(action, fields = {}, options = {}) {
  if (options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  if (fileActions.has(action)) {
    const { processLocalFile } = await import("./offlineFiles.js");
    return processLocalFile(action, fields, options);
  }
  if (fields instanceof FormData || fields instanceof Blob) {
    throw new Error("Files are processed on your device and cannot be sent to the server.");
  }
  if (navigator.onLine === false && !publicActions.has(action) && !fileActions.has(action)) {
    const { offlineAction } = await import("./offlineWorkspace.js");
    return offlineAction(action, fields);
  }
  try {
    if (!publicActions.has(action) && !fileActions.has(action) && action !== "getAccount") {
      const { currentOfflineUser, hasPendingChanges, syncWorkspace } = await import("./offlineWorkspace.js");
      const user = currentOfflineUser();
      if (user && await hasPendingChanges(user.id)) {
        await syncForUser(user, syncWorkspace, currentOfflineUser);
      }
    }
    const response = await onlineAction(action, fields, options);
    if (changedActions.test(action)) await prepareOfflineWorkspace().catch(() => {});
    return response;
  } catch (error) {
    if (!options.signal?.aborted && error instanceof TypeError && !publicActions.has(action) && !fileActions.has(action)) {
      const { offlineAction } = await import("./offlineWorkspace.js");
      return offlineAction(action, fields);
    }
    throw error;
  }
}
