// A development-only worker has its own narrow scope. Production uses the PWA
// registration, so showing a reminder never replaces the offline worker.
export async function notificationRegistration(workers, production) {
  // Finds or registers the notification service worker.
  if (production) return workers.ready;
  const registration = await workers.register("/notification-sw.js", {
    scope: "/notifications/",
  });
  if (registration.active) return registration;
  const worker = registration.installing || registration.waiting;
  if (!worker) throw new Error("Notification worker is unavailable.");
  await new Promise((resolve, reject) => {
    // Starts the asynchronous operation.
    const timer = setTimeout(
      () =>
        // Runs this step after a short delay.
        finish(new Error("Notification worker did not activate.")),
      8000,
    );
    function finish(error) {
      // Finishes waiting and releases event listeners.
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      error ? reject(error) : resolve();
    }
    function changed() {
      // Checks whether the service worker is ready.
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant")
        finish(new Error("Notification worker was replaced."));
    }
    worker.addEventListener("statechange", changed);
    changed();
  });
  return registration;
}
