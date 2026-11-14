let installPrompt = null;
let updateWorker = null;
let started = false;
let registration = null;
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
        if (
          worker?.active?.scriptURL &&
          new URL(worker.active.scriptURL).pathname === "/sw.js"
        )
          change({
            ready: true,
          });
      },
      onRegisterError() {
        // Reports an interface cache setup failure.
        change({
          error:
            "Offline setup could not finish. Reload while connected to try again.",
        });
      },
    });
    let lastCheck = 0;
    window.addEventListener("focus", () => {
      // Handles focus events.
      if (
        registration &&
        navigator.onLine !== false &&
        Date.now() - lastCheck > 60000
      ) {
        lastCheck = Date.now();
        void registration.update().catch(() => {
          // Handles a failed operation.
        });
      }
    });
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
