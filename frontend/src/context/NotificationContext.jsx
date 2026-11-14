import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext.jsx";
import sendAction from "../services/server.js";
import {
  browserPermission,
  deliverBrowserReminders,
  enabledKey,
  showBrowserNotification,
} from "../services/browserNotifications.js";
const NotificationContext = createContext(null);
const empty = {
  userId: null,
  notifications: [],
  unreadCount: 0,
  error: "",
};
export function NotificationProvider({ children }) {
  // Loads and shares account reminders.
  const { user } = useAuth();
  const userId = user?.id || null;
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const [state, setState] = useState(empty);
  const [permission, setPermission] = useState(browserPermission);
  const [enabledFor, setEnabledFor] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(
    () =>
      // Requests a fresh copy of saved records.
      setRevision(
        (value) =>
          // Increments the refresh counter.
          value + 1,
      ),
    [],
  );
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    if (!userId) {
      setState(empty);
      setEnabledFor(null);
      return;
    }
    let active = true;
    let busy = false;
    const controller = new AbortController();
    setEnabledFor(
      localStorage.getItem(enabledKey(userId)) === "true" ? userId : null,
    );
    async function poll() {
      // Checks for updated records without overlapping requests.
      if (busy || !active) return;
      busy = true;
      setPermission(browserPermission());
      try {
        const { data } = await sendAction(
          "listNotifications",
          {},
          {
            signal: controller.signal,
          },
        );
        if (!active || currentUser.current !== userId) return;
        setState({
          ...data,
          userId,
          error: "",
        });
        // Native notification failures must never hide the working in-app bell.
        try {
          await deliverBrowserReminders({
            notifications: data.notifications,
            userId,
            storage: localStorage,
            permission: browserPermission(),
            show: showBrowserNotification,
            isCurrent: () =>
              // Checks the active account's notification preference.
              active &&
              currentUser.current === userId &&
              localStorage.getItem(enabledKey(userId)) === "true",
          });
        } catch {
          /* Browser settings may block OS notifications. */
        }
      } catch (error) {
        if (active && !controller.signal.aborted)
          setState((previous) =>
            // Stores a readable reminder-loading error.
            ({
              ...(previous.userId === userId ? previous : empty),
              userId,
              error:
                error.message ||
                "Could not load reminders. Check your connection.",
            }),
          );
      } finally {
        busy = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 15000);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    return () => {
      // Cancels pending work and releases resources.
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
    };
  }, [userId, revision]);
  async function enableBrowser() {
    // Enables browser reminders for this account.
    if (!userId || browserPermission() === "unsupported") return;
    const value = await Notification.requestPermission();
    setPermission(value);
    if (value === "granted" && currentUser.current === userId) {
      localStorage.setItem(enabledKey(userId), "true");
      setEnabledFor(userId);
      refresh();
    }
  }
  function disableBrowser() {
    // Disables browser reminders for this account.
    localStorage.removeItem(enabledKey(userId));
    setEnabledFor(null);
  }
  async function markRead(id) {
    // Marks one reminder as read.
    await sendAction("readNotification", {
      id: id,
    });
    refresh();
  }
  async function markAllRead() {
    // Marks all account reminders as read.
    await sendAction("readAllNotifications", {});
    refresh();
  }
  const visible = state.userId === userId ? state : empty;
  return (
    <NotificationContext.Provider
      value={{
        ...visible,
        refresh,
        markRead,
        markAllRead,
        permission,
        browserEnabled:
          permission === "granted" && enabledFor === userId && Boolean(userId),
        enableBrowser,
        disableBrowser,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
export const useNotifications = () =>
  // Reads the reminder context.
  useContext(NotificationContext);
