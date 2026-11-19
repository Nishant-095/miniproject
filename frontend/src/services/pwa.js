let installPrompt = null;
let updateWorker = null;
let started = false;
let registration = null;
let activeFileTools = 0;
let lastCheck = 0;
let updateCheck = null;
const listeners = new Set();
let state = {
  available: false,
  installed: false,
  ready: false,
  updateAvailable: false,
  error: "",
  online: typeof navigator === "undefined" || navigator.onLine !== false,
  production: false,
  syncPending: false,
  syncError: "",
  workspaceReady: false,
  checking: false,
  checkMessage: "",
};
function change(values) {
  // Updates and publishes the shared app status.
  state = {
    ...state,
    ...values,
  };
  listeners.forEach((listener) =>
    // Notifies each subscribed component.
    listener(),
  );
}
export const getPwaState = () =>
  // Reads the shared installation and cache state.
  state;
export function subscribePwa(listener) {
  // Subscribes a component to app status changes.
  listeners.add(listener);
  return () =>
    // Runs the returned operation when called.
    listeners.delete(listener);
}

export function fileProcessing(active) {
  activeFileTools = Math.max(0, activeFileTools + (active ? 1 : -1));
}

export async function checkForPwaUpdate({ force = false } = {}) {
  if (!registration || navigator.onLine === false) return false;
  if (updateCheck) return updateCheck;
  if (!force && Date.now() - lastCheck < 60000) return false;
  lastCheck = Date.now();
  change({ checking: true, checkMessage: "" });
  updateCheck = (async () => {
    try {
      await registration.update();
      if (registration.waiting && navigator.serviceWorker.controller) change({ updateAvailable: true });
      change({ checkMessage: state.updateAvailable ? "An update is ready." : registration.installing ? "Downloading the latest app. Keep this window open." : "You have the latest available app." });
      return true;
    } catch {
      change({ checkMessage: "Could not check for updates. Try again while connected." });
      return false;
    } finally { change({ checking: false }); updateCheck = null; }
  })();
  return updateCheck;
}
function installedMode() {
  // Checks whether the app runs in standalone mode.
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true
  );
}
export async function registerPwa({
  production = import.meta.env?.PROD === true,
  registerWorker,
} = {}) {
  // Registers installation, connection, and worker events.
  if (started) return;
  started = true;
  change({
    production,
    installed: installedMode(),
    online: navigator.onLine !== false,
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    // Handles beforeinstallprompt events.
    if (!production) return;
    event.preventDefault();
    installPrompt = event;
    change({
      available: true,
    });
  });
  window.addEventListener("appinstalled", () => {
    // Handles appinstalled events.
    installPrompt = null;
    change({
      installed: true,
      available: false,
    });
  });
  window
    .matchMedia("(display-mode: standalone)")
    .addEventListener?.("change", () =>
      // Handles change events.
      change({
        installed: installedMode(),
      }),
    );
  window.addEventListener("online", () =>
    // Handles online events.
    change({
      online: true,
    }),
  );
  window.addEventListener("offline", () =>
    // Handles offline events.
    change({
      online: false,
    }),
  );
  window.addEventListener("utilityhub:sync-status", (event) => {
    change({ syncPending: Boolean(event.detail?.pending), syncError: event.detail?.error || "", ...(event.detail?.ready ? { workspaceReady: true } : {}) });
  });
  if (!production || !("serviceWorker" in navigator) || !window.isSecureContext)
    return;
  try {
    const register =
      registerWorker || (await import("virtual:pwa-register")).registerSW;
    updateWorker = register({
      immediate: true,
      onOfflineReady() {
        // Marks the app interface cache as ready.
        change({
          ready: true,
          error: "",
        });
      },
      onNeedRefresh() {
        // Offers a pending app update.
        change({
          updateAvailable: true,
          error: "",
        });
      },
      onRegisteredSW(_url, worker) {
        // Remembers the registered app service worker.
        registration = worker;
        if (worker?.waiting && navigator.serviceWorker.controller) change({ updateAvailable: true });
        // Workbox can classify a quick second release as an external install.
        // Watch waiting workers directly as well so the update stays visible.
        worker?.addEventListener?.("updatefound", () => {
          const installing = worker.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) change({ updateAvailable: true, error: "" });
          });
        });
        if (
          worker?.active?.scriptURL &&
          new URL(worker.active.scriptURL).pathname === "/sw.js"
        )
          change({
            ready: true,
          });
        void checkForPwaUpdate({ force: true });
      },
      onRegisterError() {
        // Reports an interface cache setup failure.
        change({
          error:
            "Offline setup could not finish. Reload while connected to try again.",
        });
      },
    });
    window.addEventListener("focus", () => {
      void checkForPwaUpdate();
    });
    window.addEventListener("online", () => { void checkForPwaUpdate({ force: true }); });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void checkForPwaUpdate();
    });
    window.setInterval?.(() => { void checkForPwaUpdate(); }, 5 * 60 * 1000);
  } catch {
    change({
      error:
        "Offline setup could not finish. Reload while connected to try again.",
    });
  }
}
export async function promptInstall() {
  // Opens the captured browser install prompt once.
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  change({
    available: false,
  });
  await prompt.prompt();
  // The appinstalled event, not prompt acceptance, confirms installation.
  return (await prompt.userChoice).outcome === "accepted";
}
export async function applyPwaUpdate() {
  // Activates the update after the user's choice.
  if (!updateWorker || !state.online) return false;
  if (activeFileTools) {
    change({ error: "A file is still processing. Wait for it to finish and download the result before updating." });
    return false;
  }
  try {
    await updateWorker(true);
    return true;
  } catch {
    change({
      error: "Could not update. Check your connection and try again.",
    });
    return false;
  }
}
