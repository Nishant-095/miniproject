import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatTaskDate } from "../utils/taskDates.js";
export default function NotificationBell() {
  // Displays reminders and their unread count.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const location = useLocation();
  const notify = useToast();
  const { notifications, unreadCount, error, markRead, markAllRead, refresh } =
    useNotifications();
  useEffect(
    () =>
      // Synchronizes page state and cleans up listeners.
      setOpen(false),
    [location.pathname, location.search],
  );
  useEffect(() => {
    // Synchronizes page state and cleans up listeners.
    if (!open) return;
    function outside(event) {
      // Closes the reminder panel on outside clicks.
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      // Closes the reminder panel on Escape.
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      // Runs the returned operation when called.
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function readAll() {
    // Marks all reminders as read.
    setBusy(true);
    try {
      await markAllRead();
    } catch {
      notify("Could not update reminders. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notification-wrap" ref={ref}>
      <button
        ref={buttonRef}
        className={`notification-trigger ${open ? "is-open" : ""}`}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() =>
          // Toggles the navigation or reminder panel.
          setOpen(!open)
        }
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <section
          id="notification-panel"
          className="notification-panel"
          aria-label="Task reminders"
        >
          <div className="notification-heading">
            <h2>
              Reminders <span>{unreadCount} unread</span>
            </h2>
            <Bell size={17} />
          </div>
          {error && (
            <p className="task-error" role="alert">
              {error} <button onClick={refresh}>Retry</button>
            </p>
          )}
          {notifications.length === 0 && !error ? (
            <div className="notification-empty">
              <CheckCheck size={28} />
              <b>You’re all caught up</b>
              <p>Tasks with deadlines will appear here when they’re due.</p>
            </div>
          ) : (
            <ul className="notification-list">
              {notifications.map((note) => (
                // Builds a value for each item.
                <li key={note._id} className={note.readAt ? "" : "unread"}>
                  <Link
                    to={`/tasks?task=${note.task}`}
                    onClick={() => {
                      // Opens the reminder and marks it read.
                      setOpen(false);
                      void markRead(note._id).catch(() =>
                        // Handles a failed operation.
                        notify("Could not mark reminder as read."),
                      );
                    }}
                  >
                    <span className="notification-dot" />
                    <div>
                      <b>{note.title}</b>
                      <p>Due {formatTaskDate(note.dueAt)}</p>
                      <small>
                        {note.emailStatus === "sent"
                          ? "Email sent"
                          : "Email queued"}
                      </small>
                    </div>
                    <ExternalLink size={13} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="notification-footer">
            <span>20 most recent reminders</span>
            <button disabled={!unreadCount || busy} onClick={readAll}>
              {busy ? "Updating…" : "Mark all read"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
