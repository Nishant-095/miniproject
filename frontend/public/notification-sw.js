// Development-only notification worker, registered under /notifications/.
self.addEventListener("notificationclick", (event) => {
  // Opens the task linked to the reminder.
  event.notification.close();
  let url = new URL("/tasks", self.location.origin).href;
  try {
    const target = new URL(
      event.notification.data?.url || "/tasks",
      self.location.origin,
    );
    if (target.origin === self.location.origin && target.pathname === "/tasks")
      url = target.href;
  } catch {
    /* Open the local task list. */
  }
  event.waitUntil(
    (async () => {
      // Opens or focuses the linked task page.
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const tab = tabs.find(
        (client) =>
          // Checks which items match the condition.
          new URL(client.url).origin === self.location.origin,
      );
      if (tab) {
        await tab.navigate(url);
        await tab.focus();
      } else await self.clients.openWindow(url);
    })(),
  );
});
