import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { getPwaState, subscribePwa, checkForPwaUpdate, applyPwaUpdate } from "../services/pwa.js";
import { useToast } from "../context/ToastContext.jsx";

function UpdateConfirmation({ close, update, updating }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="task-dialog pwa-help" aria-labelledby="update-title"
    onCancel={event => { event.preventDefault(); if (!updating) close(); }}>
    <div className="task-dialog-heading"><h2 id="update-title">Ready to update?</h2></div>
    <p>Updating reloads UtilityHub and clears open file forms. Download your results and save your work first. Saved workspace records stay on this device and in your account.</p>
    <div className="dialog-actions utility-actions">
      <button className="button button-secondary" disabled={updating} onClick={close}>Keep working</button>
      <button className="button" disabled={updating} onClick={update}>{updating ? "Updating…" : "Update now"}</button>
    </div>
  </dialog>;
}

export default function AppUpdateButton({ compact = false }) {
  const state = useSyncExternalStore(subscribePwa, getPwaState);
  const [updating, setUpdating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const notify = useToast();
  if (!state.production || (compact && !state.updateAvailable)) return null;
  async function update() {
    setUpdating(true);
    const applied = await applyPwaUpdate();
    if (!applied) {
      setUpdating(false);
      setConfirming(false);
      notify(getPwaState().error || "Connect to the internet to update.");
    }
  }
  async function click() {
    if (state.updateAvailable) return setConfirming(true);
    const checked = await checkForPwaUpdate({ force: true });
    notify(checked ? getPwaState().checkMessage : "Connect to the internet to check for updates.");
  }
  return <>
    <button className={compact ? "install-app-button app-update-button" : "app-update-link"} disabled={state.checking || updating || !state.online} onClick={click}>
      <RefreshCw size={14} /> {updating ? "Updating…" : state.checking ? "Checking…" : state.updateAvailable ? "Update app" : "Check for updates"}
    </button>
    {confirming && <UpdateConfirmation close={() => setConfirming(false)} update={update} updating={updating} />}
  </>;
}
