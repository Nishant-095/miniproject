import { notificationRegistration } from "./notificationWorker.js";
const seenKey = (userId) =>
  // Builds this account's reminder history key.
  `utilityhub_seen_reminders_${userId}`;
export const enabledKey = (userId) =>
  // Builds this account's notification preference key.
  `utilityhub_browser_reminders_${userId}`;
export function browserPermission() {
  // Checks browser notification availability and permission.
  return typeof Notification !== "undefined" && window.isSecureContext
    ? Notification.permission
    : "unsupported";
}
export async function showBrowserNotification(
  note,
  userId,
  isCurrent = () =>
    // Allows delivery unless the caller restricts it.
    true,
) {
  // Displays one permitted browser reminder.
  const title = "UtilityHub · Task reminder";
  const options = {
    body: note.title,
    tag: `utilityhub-${userId}-${note._id}`,
    data: {
      url: `/tasks?task=${encodeURIComponent(note.task)}`,
    },
  };
  if ("serviceWorker" in navigator) {
    let timer;
    try {
      const ready = await Promise.race([
        notificationRegistration(
          navigator.serviceWorker,
          import.meta.env?.PROD === true,
        ),
        new Promise((_, reject) => {
          // Starts the asynchronous operation.
          timer = setTimeout(
            () =>
              // Runs this step after a short delay.
              reject(new Error("Notification worker did not activate.")),
            8000,
          );
        }),
      ]);
      if (!isCurrent()) return false;
      await ready.showNotification(title, options);
      return true;
    } catch {
      /* Desktop browsers can fall back to the Notification constructor. */
    } finally {
      clearTimeout(timer);
    }
  }
  if (!isCurrent()) return false;
  const notification = new Notification(title, options);
  notification.onclick = () => {
    // Opens the task linked to this reminder.
    window.focus();
    window.location.assign(options.data.url);
    notification.close();
  };
  return true;
}
export async function deliverBrowserReminders({
  notifications,
  userId,
  storage,
  permission,
  show,
  now = Date.now(),
  isCurrent = () =>
    // Allows delivery unless the caller restricts it.
    true,
}) {
  // Shows new reminders once per account.
  if (
    !userId ||
    permission !== "granted" ||
    storage.getItem(enabledKey(userId)) !== "true"
  )
    return;
  let seen;
  try {
    const parsed = JSON.parse(storage.getItem(seenKey(userId)) || "[]");
    seen = new Set(
      Array.isArray(parsed)
        ? parsed.filter(
            (id) =>
              // Checks which items match the condition.
              typeof id === "string",
          )
        : [],
    );
  } catch {
    seen = new Set();
  }
  const fresh = notifications.filter(
    (note) =>
      // Checks which items match the condition.
      !note.readAt &&
      !seen.has(note._id) &&
      now - new Date(note.createdAt).getTime() <= 86400000,
  );
  for (const note of fresh.slice(0, 3)) {
    if (!isCurrent()) return;
    const displayed = await show(note, userId, isCurrent);
    if (displayed === false) return;
    seen.add(note._id);
    storage.setItem(seenKey(userId), JSON.stringify([...seen].slice(-200)));
  }
}
