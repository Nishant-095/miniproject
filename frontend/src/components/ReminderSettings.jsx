import { useEffect, useState } from "react";
import { BellRing, Mail, ShieldCheck } from "lucide-react";
import sendAction from "../services/server.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
export default function ReminderSettings() {
  // Displays email and browser reminder settings.
  const { user } = useAuth();
  const { permission, browserEnabled, enableBrowser, disableBrowser } =
    useNotifications();
  const notify = useToast();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    const controller = new AbortController();
    sendAction(
      "reminderSettings",
      {},
      {
        signal: controller.signal,
      },
    )
      .then(({ data }) => {
        // Handles the completed operation.
        setSettings(data);
        setError("");
      })
      .catch(() => {
        // Handles a failed operation.
        if (!controller.signal.aborted)
          setError("Could not check email settings.");
      });
    return () =>
      // Cancels pending work and releases resources.
      controller.abort();
  }, [retry]);
  async function enable() {
    // Requests browser notification permission.
    setBusy(true);
    try {
      await enableBrowser();
    } catch {
      notify("Could not enable notifications. Check your browser settings.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="reminder-settings">
      <div className="reminder-settings-title">
        <span className="tool-icon purple">
          <BellRing size={20} />
        </span>
        <div>
          <h2>A little nudge, right on time.</h2>
          <p>Reminders arrive when a task becomes due.</p>
        </div>
      </div>
      <div className="reminder-options">
        <div>
          <Mail size={18} />
          <div>
            <b>Email reminders</b>
            <p>
              {error ? (
                <>
                  {error}{" "}
                  <button
                    className="inline-button"
                    onClick={() =>
                      // Requests fresh server data.
                      setRetry(
                        (n) =>
                          // Increments the refresh counter.
                          n + 1,
                      )
                    }
                  >
                    Retry
                  </button>
                </>
              ) : !settings ? (
                "Checking settings…"
              ) : settings.emailConfigured ? (
                `Sending to ${user.email}`
              ) : (
                "Add email settings in backend/.env to enable delivery."
              )}
            </p>
            {settings && !settings.schedulerEnabled && (
              <small className="task-warning">
                The reminder scheduler is disabled in this server.
              </small>
            )}
          </div>
          <span
            className={`status-pill ${settings?.emailConfigured && settings?.schedulerEnabled ? "active" : ""}`}
          >
            {settings?.emailConfigured && settings?.schedulerEnabled
              ? "Ready"
              : "Setup needed"}
          </span>
        </div>
        <div>
          <BellRing size={18} />
          <div>
            <b>Browser notifications</b>
            <p>
              {browserEnabled
                ? "Enabled for this account. Keep a UtilityHub tab open."
                : permission === "denied"
                  ? "Blocked by your browser. Allow notifications in site settings."
                  : permission === "unsupported"
                    ? "Requires a supported browser on HTTPS or localhost."
                    : "Allow a desktop or phone notification while UtilityHub is open."}
            </p>
          </div>
          <button
            className="button button-outline button-small"
            disabled={
              busy || permission === "unsupported" || permission === "denied"
            }
            onClick={browserEnabled ? disableBrowser : enable}
          >
            {busy ? "Waiting…" : browserEnabled ? "Turn off" : "Enable"}
          </button>
        </div>
      </div>
      <p className="reminder-footnote">
        <ShieldCheck size={13} />
        The bell works without browser permission. Email checks run every minute
        while the backend is running.
      </p>
    </aside>
  );
}
