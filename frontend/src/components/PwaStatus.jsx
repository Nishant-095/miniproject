import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { getPwaState, subscribePwa, applyPwaUpdate } from "../services/pwa.js";
export default function PwaStatus() {
  // Displays connection, cache, and update status.
  const state = useSyncExternalStore(subscribePwa, getPwaState);
  const [dismissed, setDismissed] = useState(false),
    [later, setLater] = useState(false),
    [updating, setUpdating] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  useEffect(() => {
    // Put the status below a visible footer so it cannot cover update controls.
    const footer = document.querySelector(".footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setFooterVisible(entry.isIntersecting));
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);
  const update = state.updateAvailable && !later;
  if (state.online && !state.syncPending && !state.syncError && !update && ((!state.ready && !state.error) || dismissed))
    return null;
  return (
    <aside
      className={`pwa-status ${!state.online ? "pwa-offline" : ""} ${footerVisible ? "pwa-in-footer" : ""}`}
      aria-label="App status"
    >
      <div role="status">
        {!state.online ? (
          <WifiOff size={19} />
        ) : update ? (
          <RefreshCw size={19} />
        ) : (
          <Download size={19} />
        )}
        <div>
          <b>
            {!state.online
              ? "You’re offline"
              : state.syncError
                ? "Sync needs attention"
              : state.syncPending
                ? "Changes waiting to sync"
              : update
                ? "An update is ready"
                : state.error
                  ? "Offline setup needs a retry"
                  : "Your app is ready"}
          </b>
          <p>
            {!state.online
              ? "Files are processed on this device. Workspace edits are saved here and sync when you reconnect. Email needs a connection."
              : state.syncError
                ? state.syncError
              : state.syncPending
                ? "Your offline changes are waiting to sync."
              : update
                ? state.error ||
                  "Save any open forms before updating. Your saved records stay on the server."
                : state.error ||
                  (state.workspaceReady ? "The app and your workspace are ready for offline use." : "The app is cached. Sign in and connect to prepare your workspace for offline use.")}
          </p>
        </div>
      </div>
      {update && state.online && (
        <div className="pwa-update-actions">
          <button
            disabled={updating}
            className="button button-small"
            onClick={async () => {
              // Starts the selected app update.
              setUpdating(true);
              const started = await applyPwaUpdate();
              if (!started) setUpdating(false);
            }}
          >
            {updating ? "Updating…" : "Update now"}
          </button>
          <button
            className="text-link"
            disabled={updating}
            onClick={() => {
              // Postpones the app update notice.
              setLater(true);
              setDismissed(true);
            }}
          >
            Later
          </button>
        </div>
      )}
      {state.online && !update && (
        <button
          className="pwa-dismiss"
          aria-label="Dismiss app status"
          onClick={() =>
            // Dismisses the app status notice.
            setDismissed(true)
          }
        >
          <X size={15} />
        </button>
      )}
    </aside>
  );
}
