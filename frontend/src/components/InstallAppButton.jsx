import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Download, X } from "lucide-react";
import { getPwaState, subscribePwa, promptInstall } from "../services/pwa.js";
function InstallHelp({ close, production, error }) {
  // Displays browser installation instructions.
  const dialog = useRef(null);
  useEffect(() => {
    // Opens the dialog and manages its lifecycle.
    const element = dialog.current;
    element.showModal();
    return () =>
      // Runs the returned operation when called.
      element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="task-dialog pwa-help"
      aria-labelledby="install-help-title"
      onCancel={(event) => {
        // Closes the dialog when allowed.
        event.preventDefault();
        close();
      }}
    >
      <div className="task-dialog-heading">
        <h2 id="install-help-title">UtilityHub, one tap away.</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close install help"
        >
          <X size={18} />
        </button>
      </div>
      <p>
        Install UtilityHub to open it in its own window from your home screen or
        desktop.
      </p>
      {error && (
        <p className="utility-error" role="alert">
          {error}
        </p>
      )}
      {!production && (
        <p className="pwa-dev-note">
          Installation and offline access are enabled in the production build.
          Run <code>npm run build</code> and <code>npm run preview</code> to try
          them locally.
        </p>
      )}
      <ul>
        <li>
          <b>Chrome / Edge:</b> use the address bar install icon or the browser
          menu’s install option.
        </li>
        <li>
          <b>Android:</b> open the browser menu and choose Install app or Add to
          Home screen.
        </li>
        <li>
          <b>iPhone / iPad:</b> in Safari, choose Share → Add to Home Screen →
          Add.
        </li>
      </ul>
      <p className="utility-help">
        Use HTTPS or localhost. An in-app browser may not offer installation;
        open the same URL in Chrome, Edge, or Safari. After the first online
        visit finishes caching, file tools work offline. Sign in while connected
        to prepare your tasks, expenses, and notes for offline use. Offline edits
        sync on reconnect. Email and closed-app reminders need a connection.
      </p>
      <div className="dialog-actions utility-actions">
        <button className="button" onClick={close}>
          Got it
        </button>
      </div>
    </dialog>
  );
}
export default function InstallAppButton() {
  // Offers app installation or browser help.
  const state = useSyncExternalStore(subscribePwa, getPwaState);
  const [help, setHelp] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (state.installed)
    return (
      <span className="pwa-installed">
        <Check size={14} /> App installed
      </span>
    );
  async function install() {
    // Opens the browser's installation prompt.
    if (!state.available) {
      setHelp(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await promptInstall();
    } catch {
      setError(
        "The install prompt could not open. Use your browser menu instead.",
      );
      setHelp(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="install-app-button" onClick={install} disabled={busy}>
        <Download size={15} />
        {busy ? "Opening…" : "Install app"}
      </button>
      {help && (
        <InstallHelp
          production={state.production}
          error={error}
          close={() =>
            // Closes the installation help dialog.
            setHelp(false)
          }
        />
      )}
    </>
  );
}
